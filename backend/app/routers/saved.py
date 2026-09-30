from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from ..core.errors import not_found
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.common import ApiModel
from ..schemas.opportunities import OpportunityCard
from ..services import catalog, events, fit as fitsvc, presenters
from ..services.activity import log_activity
from ..services.common import parse_uuid
from ..engines.recommender import score_fit

router = APIRouter(prefix="/api/saved", tags=["saved"])


class SavedOut(ApiModel):
    items: list[OpportunityCard]
    total: int


@router.get("", response_model=SavedOut)
def list_saved(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    ids = [r["id"] for r in db.all("select opportunity_id::text as id from public.saved_opportunities where student_id = cast(:u as uuid) order by saved_at desc", u=user.id)]
    if not ids:
        return {"items": [], "total": 0}
    rows, _ = catalog.search(db, {"ids": ids, "include_expired": True}, "newest", 1, 200)
    by_id = {r["id"]: r for r in rows}
    s, ctx = fitsvc.load_context(db, user.id)
    fits = fitsvc.fit_for_rows(rows, s, ctx)
    _, apps = presenters.user_flags(db, user.id, ids)
    return {"items": [presenters.card(by_id[i], fits[i], True, apps.get(i)) for i in ids if i in by_id], "total": len(ids)}


@router.put("/{opportunity_id}", status_code=204, summary="Save (idempotent)")
def save(opportunity_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    oid = parse_uuid(opportunity_id, "opportunity")
    r = catalog.get_one(db, oid)
    if not r:
        raise not_found("Opportunity")
    created = db.run("insert into public.saved_opportunities (student_id, opportunity_id) values (cast(:u as uuid), cast(:o as uuid)) on conflict do nothing", u=user.id, o=oid)
    if created:
        s, ctx = fitsvc.load_context(db, user.id)
        fit = score_fit(s, catalog.to_signals(r), ctx)
        with db.service():
            db.run("insert into public.recommendation_events (student_id, opportunity_id, event_type, fit_score) values (cast(:u as uuid), cast(:o as uuid), 'saved', :f)", u=user.id, o=oid, f=fit.overall)
        events.record(db, user.id, "save", oid, {"fit": fit.overall})
        log_activity(db, user.id, "opportunity_saved", f"Saved {r['title']}", f"/opportunities/{oid}")
    return Response(status_code=204)


@router.delete("/{opportunity_id}", status_code=204)
def unsave(opportunity_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    oid = parse_uuid(opportunity_id, "opportunity")
    if db.run("delete from public.saved_opportunities where student_id = cast(:u as uuid) and opportunity_id = cast(:o as uuid)", u=user.id, o=oid):
        events.record(db, user.id, "unsave", oid)
    return Response(status_code=204)
