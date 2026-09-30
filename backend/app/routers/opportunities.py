from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import PlainTextResponse

from ..core.errors import bad_request, not_found
from ..core.middleware import rate_limit
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..engines.types import FitResult
from ..engines.why_not import explain_blockers
from ..schemas.common import Page, page_of
from ..schemas.opportunities import CompareIn, CompareOut, EventIn, OpportunityDetail, OpportunityPage, RecommendationsOut
from ..services import catalog, events, fit as fitsvc, presenters
from ..services.common import parse_uuid

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])

Difficulty = Literal["beginner", "intermediate", "advanced"]
Format = Literal["online", "offline", "hybrid"]
Participation = Literal["individual", "team"]
WorkMode = Literal["remote", "onsite", "hybrid"]
Freshness = Literal["fresh", "aging", "stale", "expired", "unknown"]
FIT_SCAN_LIMIT = 1000


def _filters(
    q: Optional[str] = Query(None, max_length=200), category: list[str] = Query([]), domain: list[str] = Query([]),
    skill: list[str] = Query([]), difficulty: list[Difficulty] = Query([]), format: list[Format] = Query([]),
    participation: list[Participation] = Query([]), work_mode: list[WorkMode] = Query([]), freshness: list[Freshness] = Query([]),
    team_size: Optional[int] = Query(None, ge=1, le=20), location: Optional[str] = Query(None, max_length=100),
    eligibility: Optional[str] = Query(None, max_length=100), deadline_within: Optional[int] = Query(None, ge=1, le=365),
    verified: Optional[bool] = None, include_expired: bool = False,
) -> dict:
    return {"q": q, "category": category, "domain": domain, "skills": skill, "difficulty": difficulty, "format": format,
            "participation": participation, "work_mode": work_mode, "freshness": freshness, "team_size": team_size, "location": location,
            "eligibility": eligibility, "deadline_within": deadline_within, "verified": verified, "include_expired": include_expired}


@router.get("", response_model=OpportunityPage, summary="Search & filter opportunities (server-side)")
def list_opportunities(
    filters: dict = Depends(_filters), sort: Literal["relevance", "deadline", "newest", "fit"] = "relevance",
    min_fit: Optional[float] = Query(None, ge=0, le=100), page: int = Query(1, ge=1, le=1000), page_size: int = Query(12, ge=1, le=50),
    user: CurrentUser = Depends(require_student), db: Db = Depends(get_db),
):
    s, ctx = fitsvc.load_context(db, user.id)
    need_fit_scan = sort == "fit" or min_fit is not None
    if need_fit_scan:
        rows, total = catalog.search(db, filters, "relevance", 1, page_size, limit_all=FIT_SCAN_LIMIT)
        fits = fitsvc.fit_for_rows(rows, s, ctx)
        rows = [r for r in rows if min_fit is None or fits[r["id"]].overall >= min_fit]
        if sort == "fit":
            rows.sort(key=lambda r: (-fits[r["id"]].overall, r["deadline"] is None, r["deadline"] or 0, r["title"]))
        matched, truncated = len(rows), total > FIT_SCAN_LIMIT
        rows = rows[(page - 1) * page_size: page * page_size]
    else:
        rows, matched = catalog.search(db, filters, sort, page, page_size)
        fits, truncated = fitsvc.fit_for_rows(rows, s, ctx), False
    saved, apps = presenters.user_flags(db, user.id, [r["id"] for r in rows])
    items = [presenters.card(r, fits[r["id"]], r["id"] in saved, apps.get(r["id"])) for r in rows]
    if filters.get("q"):
        events.record(db, user.id, "search", payload={"q": filters["q"][:100], "filters": sum(1 for k, v in filters.items() if v and k != "q")}) if page == 1 else None
    return {"items": items, "total": matched, "page": page, "page_size": page_size, "pages": max(1, -(-matched // page_size)),
            "fit_scan_truncated": truncated, "applied": {k: v for k, v in filters.items() if v not in (None, [], False)}, "sort": sort, "min_fit": min_fit}


@router.get("/facets", response_model=dict, summary="Filter option counts for the current filters")
def get_facets(filters: dict = Depends(_filters), db: Db = Depends(get_db)):
    return catalog.facets(db, filters)


@router.get("/recommendations", response_model=RecommendationsOut, summary="Personalised, explained ranking")
def recommendations(limit: int = Query(10, ge=1, le=50), min_fit: float = Query(0, ge=0, le=100),
                    user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    s, ctx = fitsvc.load_context(db, user.id)
    rows, _ = catalog.search(db, {}, "relevance", 1, 50, limit_all=FIT_SCAN_LIMIT)
    fits = fitsvc.fit_for_rows(rows, s, ctx)
    dismissed = ctx.affinity.dismissed
    rows = [r for r in rows if r["id"] not in dismissed and fits[r["id"]].overall >= min_fit]
    rows.sort(key=lambda r: (-fits[r["id"]].overall, r["deadline"] is None, r["deadline"] or 0, r["title"]))
    rows = rows[:limit]
    saved, apps = presenters.user_flags(db, user.id, [r["id"] for r in rows])
    return {"items": [presenters.card(r, fits[r["id"]], r["id"] in saved, apps.get(r["id"])) for r in rows], "total": len(rows),
            "based_on": {"confirmedSkills": len(s.skills), "interests": len(s.interests), "behaviouralEvents": ctx.affinity.n_events}}


@router.post("/compare", response_model=CompareOut, summary="Side-by-side comparison of 2–4 opportunities")
def compare(body: CompareIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    ids = [parse_uuid(i, "opportunity") for i in dict.fromkeys(body.ids)]
    if not 2 <= len(ids) <= 4:
        raise bad_request("Choose between 2 and 4 opportunities to compare")
    rows, _ = catalog.search(db, {"ids": ids, "include_expired": True}, "newest", 1, 10)
    if len(rows) != len(ids):
        raise not_found("One or more opportunities")
    s, ctx = fitsvc.load_context(db, user.id)
    fits = fitsvc.fit_for_rows(rows, s, ctx)
    order = {i: n for n, i in enumerate(ids)}
    rows.sort(key=lambda r: order[r["id"]])
    saved, apps = presenters.user_flags(db, user.id, ids)
    items = [presenters.card(r, fits[r["id"]], r["id"] in saved, apps.get(r["id"])) for r in rows]
    live = [(r, fits[r["id"]]) for r in rows if not fits[r["id"]].expired]
    strongest = None
    if live:
        r, f = sorted(live, key=lambda t: (-t[1].overall, t[0]["deadline"] is None, t[0]["deadline"] or 0, t[0]["title"]))[0]
        strongest = {"id": r["id"], "title": r["title"], "fit": f.overall,
                     "reason": f"Highest fit of the {len(rows)} ({f.overall:.0f}%)" + (f", {len(f.matched_skills)}/{len(r['required_skills'])} required skills matched" if r["required_skills"] else "")
                               + (f", closes in {presenters.urgency(r['deadline'])['days_remaining']} days" if r["deadline"] else "")}
    for r in rows:
        events.record(db, user.id, "compare", r["id"])
    return {"items": items, "strongest": strongest}


@router.get("/{opportunity_id}", response_model=OpportunityDetail, summary="Opportunity detail with fit, why and why-not")
def get_opportunity(opportunity_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    oid = parse_uuid(opportunity_id, "opportunity")
    r = catalog.get_one(db, oid)
    if not r:
        raise not_found("Opportunity")
    s, ctx = fitsvc.load_context(db, user.id)
    sig = catalog.to_signals(r)
    from ..engines.recommender import score_fit
    fit: FitResult = score_fit(s, sig, ctx)
    saved, apps = presenters.user_flags(db, user.id, [oid])
    sources = db.all("""select src.name, src.kind, l.source_url as url, l.last_seen_at from public.opportunity_source_links l
                          join public.opportunity_sources src on src.id = l.source_id where l.opportunity_id = cast(:o as uuid) order by l.first_seen_at""", o=oid) if user.is_admin else []
    demo = r["source_type"] == "dev_seed"
    out = presenters.card(r, fit, oid in saved, apps.get(oid))
    out.update({
        "description": r["description"], "eligibility": r["eligibility"], "educationRequirements": r["education_requirements"],
        "experienceRequirements": r["experience_requirements"], "registrationStart": r["registration_start"], "eventStart": r["event_start"],
        "eventEnd": r["event_end"], "applicationUrl": None if demo else r["application_url"], "lastSeenAt": None if demo else r["last_seen_at"],
        "sources": [{"name": x["name"], "kind": x["kind"], "url": x["url"], "lastSeenAt": x["last_seen_at"]} for x in sources],
        "fitDetail": presenters.fit_detail(fit), "whyNot": explain_blockers(s, sig, fit, ctx),
    })
    return out


@router.get("/{opportunity_id}/calendar.ics", summary="Add the deadline to any calendar app (no OAuth)")
def calendar_ics(opportunity_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    from ..ics import build_ics
    oid = parse_uuid(opportunity_id, "opportunity")
    r = catalog.get_one(db, oid)
    if not r or not r["deadline"]:
        raise not_found("Opportunity deadline")
    url = "" if r["source_type"] == "dev_seed" else (r["external_url"] or "")
    return PlainTextResponse(build_ics(oid, r["title"], f"{r['title']} · {r['organization']}", r["deadline"], url), media_type="text/calendar",
                             headers={"Content-Disposition": 'attachment; filename="nirmaan-deadline.ics"'})


@router.post("/{opportunity_id}/events", status_code=204, summary="Record a view / dismiss / compare signal")
def opportunity_event(opportunity_id: str, body: EventIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db),
                      _rl=Depends(rate_limit("opp-event", 120))):
    oid = parse_uuid(opportunity_id, "opportunity")
    if not catalog.get_one(db, oid):
        raise not_found("Opportunity")
    events.record(db, user.id, {"view": "opportunity_view", "dismiss": "dismiss", "compare": "compare"}[body.type], oid, dedupe_minutes=10 if body.type == "view" else 0)
    return Response(status_code=204)
