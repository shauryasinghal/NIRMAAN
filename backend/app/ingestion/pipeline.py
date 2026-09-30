"""fetch → parse → normalise → validate → classify → deduplicate → verify → store → index.

Runs as service_role (it is a system job). Every record is processed in a SAVEPOINT so one bad record
cannot abort the run; rejected records are counted and their reasons kept in the run detail.
Dedupe order: same (source, external id) → canonical URL → same org + normalised title (+ close deadlines)
→ semantic similarity within the same org (when an embedder is supplied). A duplicate from another source is
never shown twice: it only adds a source link (attribution) and fills fields the first record left NULL.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from urllib.parse import urlsplit

from pydantic import ValidationError

from ..core.logging import get_logger
from ..db.session import Db, vector_literal
from .models import Candidate, RunStats
from .normalize import norm_title, to_candidate, validate
from .sources.base import OpportunitySource

log = get_logger("ingestion")
SOURCE_TYPE = {"official_api": "official", "official_feed": "official", "partner": "official", "public_listing": "aggregator", "fixture": "dev_seed"}
MERGE_FIELDS = ["subcategory", "domain_id", "difficulty", "format", "work_mode", "participation", "min_team_size", "max_team_size", "location", "eligibility",
                "education_requirements", "experience_requirements", "prize_text", "stipend_amount", "stipend_currency", "salary_text", "certificate",
                "registration_start", "deadline", "event_start", "event_end", "external_url", "application_url", "canonical_url"]


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80] or "org"


def ensure_source(db: Db, src: OpportunitySource) -> tuple[str, bool]:
    row = db.one("select id::text as id, enabled from public.opportunity_sources where key = :k", k=src.key)
    if row:
        return row["id"], row["enabled"]
    enabled = src.kind == "fixture"      # real sources start disabled until an admin has reviewed terms + robots.txt
    sid = db.val("""insert into public.opportunity_sources (key, name, kind, enabled) values (:k, :n, :kind, :e) returning id::text""",
                 k=src.key, n=src.name, kind=src.kind, e=enabled)
    return sid, enabled


def _org_id(db: Db, name: str) -> str:
    slug = slugify(name)
    return db.val("""insert into public.organizations (slug, name) values (:s, :n)
                     on conflict (slug) do update set name = public.organizations.name returning id::text""", s=slug, n=name)


def find_duplicate(db: Db, src_id: str, c: Candidate, org_id: str, vec: list[float] | None, sem_threshold: float) -> tuple[str, str] | None:
    hit = db.val("select opportunity_id::text from public.opportunity_source_links where source_id = cast(:s as uuid) and external_id = :e", s=src_id, e=c.external_id)
    if hit:
        return hit, "same_source_record"
    if c.canonical_url:
        hit = db.val("select id::text from public.opportunities where canonical_url = :u", u=c.canonical_url)
        if hit:
            return hit, "canonical_url"
    tn = norm_title(c.title)
    rows = db.all("select id::text as id, deadline from public.opportunities where organization_id = cast(:o as uuid) and title_norm = :t", o=org_id, t=tn)
    for r in rows:
        if c.deadline is None or r["deadline"] is None or abs((r["deadline"] - c.deadline).days) <= 7:
            return r["id"], "title_org_deadline"
    if vec is not None:
        row = db.one("""select e.opportunity_id::text as id, 1 - (e.embedding <=> cast(:v as extensions.vector)) as sim
                          from public.opportunity_embeddings e join public.opportunities o on o.id = e.opportunity_id
                         where o.organization_id = cast(:o as uuid) order by e.embedding <=> cast(:v as extensions.vector) limit 1""", v=vector_literal(vec), o=org_id)
        if row and row["sim"] >= sem_threshold:
            return row["id"], f"semantic({row['sim']:.2f})"
    return None


def _params(c: Candidate, domain_id: str | None) -> dict:
    return dict(
        title=c.title, description=c.description, category=c.category, subcategory=c.subcategory, domain_id=domain_id, tags=c.tags, difficulty=c.difficulty,
        format=c.format, work_mode=c.work_mode, participation=c.participation, min_team_size=c.min_team_size, max_team_size=c.max_team_size, location=c.location,
        eligibility=c.eligibility, education_requirements=c.education_requirements, experience_requirements=c.experience_requirements,
        prize_text=c.prize_text, stipend_amount=c.stipend_amount, stipend_currency=c.stipend_currency, salary_text=c.salary_text, certificate=c.certificate,
        registration_start=c.registration_start, deadline=c.deadline, event_start=c.event_start, event_end=c.event_end, external_url=c.official_url,
        application_url=c.application_url, canonical_url=c.canonical_url)


COLS_CAST = {"difficulty": "cast(:difficulty as public.skill_level)", "format": "cast(:format as public.opportunity_format)",
             "participation": "cast(:participation as public.participation_mode)", "domain_id": "cast(:domain_id as uuid)"}


def _insert(db: Db, org_id: str, src: OpportunitySource, c: Candidate, domain_id: str | None, verified: bool) -> str:
    p = _params(c, domain_id)
    cols = list(p)
    values = ", ".join(COLS_CAST.get(k, f":{k}") for k in cols)
    return db.val(
        f"""insert into public.opportunities (organization_id, {', '.join(cols)}, source, source_type, source_ref, verification_status, last_verified_at, last_seen_at, status)
            values (cast(:org as uuid), {values}, :source, cast(:st as public.source_type), :ref, :vs, {'now()' if verified else 'null'}, now(), 'active') returning id::text""",
        org=org_id, source=src.name, st=SOURCE_TYPE[src.kind], ref=c.external_id, vs="verified" if verified else "unverified", **p)


def _set_skills(db: Db, opp_id: str, c: Candidate) -> None:
    db.run("delete from public.opportunity_skills where opportunity_id = cast(:o as uuid)", o=opp_id)
    for names, imp in ((c.required_skills, "required"), (c.preferred_skills, "preferred")):
        for n in names:
            db.run("""insert into public.opportunity_skills (opportunity_id, skill_id, importance)
                      select cast(:o as uuid), id, :i from public.skills where name = :n on conflict (opportunity_id, skill_id) do nothing""", o=opp_id, i=imp, n=n)


def _merge(db: Db, opp_id: str, c: Candidate, domain_id: str | None, same_source: bool) -> None:
    """Same source → authoritative overwrite; different source → only fill NULLs (never clobber)."""
    p = _params(c, domain_id)
    if same_source:
        sets = ", ".join(f"{k} = {COLS_CAST.get(k, f':{k}')}" for k in p if k not in ("tags",)) + ", tags = :tags, last_seen_at = now()"
    else:
        sets = ", ".join(f"{k} = coalesce(public.opportunities.{k}, {COLS_CAST.get(k, f':{k}')})" for k in MERGE_FIELDS if k in p) + ", last_seen_at = now()"
    db.run(f"update public.opportunities set {sets} where id = cast(:id as uuid)", id=opp_id, **p)


def _verified(src: OpportunitySource, c: Candidate) -> bool:
    if src.kind not in ("official_api", "official_feed", "partner") or not c.canonical_url:
        return False
    host = urlsplit(c.canonical_url).netloc
    return any(host == h or host.endswith("." + h) for h in src.official_hosts)


def run_source(db: Db, src: OpportunitySource, embedder=None, semantic_threshold: float = 0.93, force: bool = False) -> RunStats:
    stats = RunStats()
    with db.service():
        src_id, enabled = ensure_source(db, src)
        if not enabled and not force:
            raise PermissionError(f"Source '{src.key}' is disabled. Review its terms and robots.txt, then enable it in opportunity_sources.")
        run_id = db.val("insert into public.ingestion_runs (source_id) values (cast(:s as uuid)) returning id::text", s=src_id)
        vocab = {r["name"] for r in db.all("select name from public.skills")}
        interests = db.all("select id::text as id, slug, lower(name) as name from public.interests")
        slug_to_id = {i["slug"]: i["id"] for i in interests}
        name_to_slug = {i["name"]: i["slug"] for i in interests}
        new_ids: list[str] = []
        status, err = "succeeded", None
        try:
            for raw in src.fetch():
                stats.fetched += 1
                nested = db.conn.begin_nested()
                try:
                    cand = to_candidate(raw.external_id, raw.data, vocab, set(slug_to_id), name_to_slug)
                    problems = validate(cand)
                    if problems:
                        raise ValueError("; ".join(problems))
                    domain_id = slug_to_id.get(cand.domain) if cand.domain else None
                    org_id = _org_id(db, cand.organization)
                    vec = embedder.encode([f"{cand.title}. {cand.description}"])[0] if embedder else None
                    dup = find_duplicate(db, src_id, cand, org_id, vec, semantic_threshold)
                    if dup:
                        opp_id, reason = dup
                        same = reason == "same_source_record"
                        _merge(db, opp_id, cand, domain_id, same)
                        if same:
                            stats.updated += 1
                            _set_skills(db, opp_id, cand)
                        else:
                            stats.duplicates += 1
                    else:
                        opp_id = _insert(db, org_id, src, cand, domain_id, _verified(src, cand))
                        _set_skills(db, opp_id, cand)
                        stats.inserted += 1
                        new_ids.append(opp_id)
                    db.run("""insert into public.opportunity_source_links (opportunity_id, source_id, external_id, source_url) values (cast(:o as uuid), cast(:s as uuid), :e, :u)
                              on conflict (source_id, external_id) do update set last_seen_at = now(), source_url = excluded.source_url""",
                           o=opp_id, s=src_id, e=raw.external_id, u=raw.source_url)
                    if vec is not None:
                        db.run("""insert into public.opportunity_embeddings (opportunity_id, model, embedding) values (cast(:o as uuid), :m, cast(:v as extensions.vector))
                                  on conflict (opportunity_id) do update set embedding = excluded.embedding, model = excluded.model, updated_at = now()""",
                               o=opp_id, m=getattr(embedder, "name", "unknown"), v=vector_literal(vec))
                    nested.commit()
                except (ValidationError, ValueError) as exc:
                    nested.rollback()
                    stats.rejected += 1
                    stats.rejections.append({"externalId": raw.external_id, "reason": str(exc).splitlines()[0][:200]})
                except Exception as exc:
                    nested.rollback()
                    stats.rejected += 1
                    stats.errors.append(f"{raw.external_id}: {type(exc).__name__}")
                    log.error("record failed", extra={"event": "ingestion_record_failed", "source": src.key, "code": type(exc).__name__})
        except Exception as exc:       # fetch itself failed (network, robots, parse)
            status, err = "failed", f"{type(exc).__name__}: {str(exc)[:200]}"
            log.error("ingestion failed", extra={"event": "ingestion_failed", "source": src.key, "code": type(exc).__name__})
        if status != "failed" and (stats.rejected or stats.errors):
            status = "partial"
        db.run("select private.refresh_opportunity_freshness()")
        db.run("""update public.ingestion_runs set status = :st, finished_at = now(), fetched = :f, inserted = :i, updated = :u, duplicates = :d, rejected = :r, error = :e,
                         detail = cast(:detail as jsonb) where id = cast(:id as uuid)""",
               st=status, f=stats.fetched, i=stats.inserted, u=stats.updated, d=stats.duplicates, r=stats.rejected, e=err, id=run_id,
               detail=json.dumps({"rejections": stats.rejections[:50], "errors": stats.errors[:50], "newIds": new_ids[:500]}))
        db.run("update public.opportunity_sources set last_run_at = now() where id = cast(:s as uuid)", s=src_id)
    stats.new_ids = new_ids  # type: ignore[attr-defined]
    stats.status = status    # type: ignore[attr-defined]
    stats.error = err        # type: ignore[attr-defined]
    log.info("ingestion finished", extra={"event": "ingestion_finished", "source": src.key, "count": stats.inserted})
    return stats
