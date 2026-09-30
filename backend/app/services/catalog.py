"""Opportunity discovery: server-side search, filters, facets, and signal loaders.
All filtering / sorting / pagination happens in SQL — the browser never receives the catalog."""
from __future__ import annotations

import datetime as dt
import threading
import time
from typing import Any

from ..db.session import Db
from ..engines.recommender import build_domain_profiles
from ..engines.types import OppSignals
from .common import like_escape

CARD_SELECT = """
  o.id::text as id, o.title, o.description, o.category, o.subcategory, o.tags, o.difficulty::text as difficulty, o.format::text as format,
  o.work_mode, o.participation::text as participation, o.min_team_size, o.max_team_size, o.deadline, o.registration_start, o.event_start, o.event_end,
  o.location, o.prize_text, o.prize_amount::float as prize_amount, o.stipend_amount::float as stipend_amount, o.stipend_currency, o.salary_text, o.certificate,
  o.eligibility, o.education_requirements, o.experience_requirements, o.external_url, o.application_url, o.source, o.source_type::text as source_type,
  o.verification_status, o.last_verified_at, o.last_seen_at, o.freshness_status, o.created_at, o.updated_at,
  org.name as organization, org.slug as organization_slug, lower(i.name) as domain, i.name as domain_label, i.slug as domain_slug,
  coalesce(array(select s.name from public.opportunity_skills os join public.skills s on s.id = os.skill_id
                  where os.opportunity_id = o.id and os.importance = 'required' order by s.name), '{}') as required_skills,
  coalesce(array(select s.name from public.opportunity_skills os join public.skills s on s.id = os.skill_id
                  where os.opportunity_id = o.id and os.importance = 'preferred' order by s.name), '{}') as preferred_skills
"""
FROM = """from public.opportunities o join public.organizations org on org.id = o.organization_id left join public.interests i on i.id = o.domain_id"""

MULTI = {  # filter name -> SQL expression
    "category": "o.category", "difficulty": "o.difficulty::text", "format": "o.format::text",
    "participation": "o.participation::text", "work_mode": "o.work_mode", "freshness": "o.freshness_status",
    "domain": "i.slug", "source_type": "o.source_type::text",
}
SORTS = {"relevance", "deadline", "newest", "fit"}


def build_where(f: dict, skip: str | None = None) -> tuple[str, dict]:
    where, p = ["o.status = 'active'"], {}
    if not f.get("include_expired"):
        where.append("(o.deadline is null or o.deadline >= current_date)")
    for name, expr in MULTI.items():
        vals = f.get(name)
        if vals and skip != name:
            where.append(f"{expr} = any(:{name})")
            p[name] = list(vals)
    if f.get("skills") and skip != "skills":
        where.append("""exists (select 1 from public.opportunity_skills os join public.skills s on s.id = os.skill_id
                                  where os.opportunity_id = o.id and s.name = any(:skills))""")
        p["skills"] = [s.lower() for s in f["skills"]]
    if f.get("q"):
        q = f["q"].strip()[:200]
        where.append("""(o.search_tsv @@ websearch_to_tsquery('english'::regconfig, :q) or o.search_text like '%' || lower(:qlike) || '%'
                         or lower(org.name) like '%' || lower(:qlike) || '%'
                         or exists (select 1 from public.opportunity_skills os join public.skills s on s.id = os.skill_id
                                     where os.opportunity_id = o.id and s.name = lower(:q))
                         or exists (select 1 from unnest(o.tags) t where lower(t) = lower(:q)))""")
        p["q"], p["qlike"] = q, like_escape(q)
    if f.get("location"):
        where.append("o.location ilike '%' || :loc || '%'"); p["loc"] = like_escape(f["location"][:100])
    if f.get("eligibility"):
        where.append("(o.eligibility ilike '%' || :elig || '%' or o.education_requirements ilike '%' || :elig || '%')"); p["elig"] = like_escape(f["eligibility"][:100])
    if f.get("deadline_within") is not None:
        where.append("o.deadline between current_date and current_date + cast(:dw as int)"); p["dw"] = int(f["deadline_within"])
    if f.get("team_size") is not None:
        where.append("(o.min_team_size is null or o.min_team_size <= :ts) and (o.max_team_size is null or o.max_team_size >= :ts)"); p["ts"] = int(f["team_size"])
    if f.get("verified") is True and skip != "verified":
        where.append("o.verification_status = 'verified'")
    if f.get("ids"):
        where.append("o.id = any(cast(:ids as uuid[]))"); p["ids"] = list(f["ids"])
    return " and ".join(where), p


def search(db: Db, f: dict, sort: str, page: int, page_size: int, *, limit_all: int | None = None) -> tuple[list[dict], int]:
    """SQL search. When `limit_all` is set the whole (capped) match set is returned so fit can sort/filter it."""
    where, params = build_where(f)
    rank = None
    if f.get("q"):
        rank = "(ts_rank_cd(o.search_tsv, websearch_to_tsquery('english'::regconfig, :q)) + 0.5 * extensions.similarity(o.search_text, lower(:q)))"
    order = {"deadline": "o.deadline asc nulls last, o.title asc", "newest": "o.created_at desc, o.title asc"}.get(sort)
    if order is None:   # relevance (and the fit pre-scan): text relevance when searching, otherwise newest
        order = f"{rank} desc, o.created_at desc, o.title asc" if rank else "o.created_at desc, o.title asc"
    total = db.val(f"select count(*) {FROM} where {where}", **params)
    if limit_all:
        rows = db.all(f"select {CARD_SELECT} {FROM} where {where} order by {order} limit :lim", lim=limit_all, **params)
    else:
        rows = db.all(f"select {CARD_SELECT} {FROM} where {where} order by {order} limit :lim offset :off", lim=page_size, off=(page - 1) * page_size, **params)
    return rows, int(total)


def facets(db: Db, f: dict) -> dict:
    """Counts per option, each computed with that facet's own filter removed (so choices stay selectable)."""
    out: dict[str, Any] = {}
    exprs = {"category": "o.category", "difficulty": "o.difficulty::text", "format": "o.format::text", "participation": "o.participation::text",
             "workMode": "o.work_mode", "freshness": "o.freshness_status", "domain": "i.slug"}
    skip_key = {"workMode": "work_mode"}
    for name, expr in exprs.items():
        where, params = build_where(f, skip=skip_key.get(name, name))
        label = "any_value(i.name)" if name == "domain" else "null"
        rows = db.all(f"select {expr} as value, count(*)::int as count, {label} as label {FROM} where {where} and {expr} is not null group by 1 order by 2 desc, 1", **params)
        out[name] = [{"value": r["value"], "count": r["count"], **({"label": r["label"]} if r["label"] else {})} for r in rows]
    where, params = build_where(f, skip="skills")
    out["skills"] = [{"value": r["value"], "count": r["count"]} for r in db.all(
        f"""select s.name as value, count(distinct o.id)::int as count {FROM} join public.opportunity_skills os on os.opportunity_id = o.id
              join public.skills s on s.id = os.skill_id where {where} group by 1 order by 2 desc, 1 limit 30""", **params)]
    where, params = build_where(f, skip="verified")
    out["verified"] = db.val(f"select count(*)::int {FROM} where {where} and o.verification_status = 'verified'", **params)
    return out


def get_one(db: Db, opportunity_id: str) -> dict | None:
    return db.one(f"select {CARD_SELECT} {FROM} where o.id = cast(:id as uuid) and o.status = 'active'", id=opportunity_id)


def to_signals(r: dict) -> OppSignals:
    return OppSignals(
        id=r["id"], title=r["title"], organization=r["organization"], domain=r.get("domain"), category=r["category"],
        tags=tuple(r.get("tags") or ()), required=frozenset(s.lower() for s in r["required_skills"]),
        preferred=frozenset(s.lower() for s in r["preferred_skills"]), difficulty=r["difficulty"], format=r["format"],
        work_mode=r["work_mode"], participation=r["participation"], min_team=r["min_team_size"], max_team=r["max_team_size"],
        deadline=r["deadline"], location=r["location"], education_requirements=r["education_requirements"],
        eligibility=r["eligibility"], is_demo=r["source_type"] == "dev_seed")


# ── domain skill profiles (catalog-wide, cached briefly) ────────────────────────────────────────
_dp_cache: tuple[float, dict] | None = None
_dp_lock = threading.Lock()


def domain_profiles(db: Db) -> dict:
    global _dp_cache
    with _dp_lock:
        if _dp_cache and time.monotonic() - _dp_cache[0] < 300:
            return _dp_cache[1]
    rows = db.all("""select lower(i.name) as domain, s.name as skill, count(*)::int as n
                       from public.opportunity_skills os join public.opportunities o on o.id = os.opportunity_id and o.status = 'active'
                       join public.interests i on i.id = o.domain_id join public.skills s on s.id = os.skill_id group by 1, 2""")
    prof = build_domain_profiles([(r["domain"], r["skill"], r["n"]) for r in rows])
    with _dp_lock:
        _dp_cache = (time.monotonic(), prof)
    return prof


def clear_caches() -> None:
    global _dp_cache
    _dp_cache = None
