from __future__ import annotations

import datetime as dt
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import ConfigDict, Field

from ..core.errors import conflict, not_found
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.common import ApiModel
from ..services import applications as svc, catalog, events, fit as fitsvc
from ..services.activity import log_activity
from ..services.common import parse_uuid
from ..engines.recommender import score_fit

router = APIRouter(prefix="/api/applications", tags=["applications"])
Status = Literal["wishlist", "saved", "planning", "applying", "applied", "shortlisted", "interview", "selected", "rejected", "withdrawn"]
PIPELINE = ["wishlist", "saved", "planning", "applying", "applied", "shortlisted", "interview", "selected", "rejected", "withdrawn"]


class AppOpportunity(ApiModel):
    id: str
    title: str
    organization: str
    category: Optional[str] = None
    deadline: Optional[dt.date] = None
    days_remaining: Optional[int] = None
    urgency: str
    is_expired: bool
    is_demo: bool


class TimelineEvent(ApiModel):
    id: str
    kind: str
    detail: str
    created_at: dt.datetime


class ApplicationOut(ApiModel):
    id: str
    status: Status
    notes: str
    next_action: Optional[str] = None
    reminder_at: Optional[dt.date] = None
    created_at: dt.datetime
    updated_at: dt.datetime
    opportunity: AppOpportunity
    timeline: Optional[list[TimelineEvent]] = None


class ApplicationCreate(ApiModel):
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    opportunity_id: str
    status: Status = "wishlist"


class ApplicationPatch(ApiModel):
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    status: Optional[Status] = None
    notes: Optional[str] = Field(None, max_length=5000)
    next_action: Optional[str] = Field(None, max_length=300)
    reminder_at: Optional[dt.date] = None


class ListOut(ApiModel):
    items: list[ApplicationOut]
    total: int
    counts: dict[str, int]


@router.get("", response_model=ListOut)
def list_applications(status: Optional[Status] = None, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    items = svc.list_for(db, user.id, status)
    counts = {s: 0 for s in PIPELINE}
    for r in db.all("select status::text as s, count(*)::int as n from public.applications where student_id = cast(:u as uuid) group by 1", u=user.id):
        counts[r["s"]] = r["n"]
    return {"items": items, "total": len(items), "counts": counts}


@router.get("/insights")
def application_insights(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return {"items": svc.insights(db, user.id)}


@router.post("", response_model=ApplicationOut, status_code=201)
def create_application(body: ApplicationCreate, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    oid = parse_uuid(body.opportunity_id, "opportunity")
    r = catalog.get_one(db, oid)
    if not r:
        raise not_found("Opportunity")
    if db.val("select 1 from public.applications where student_id = cast(:u as uuid) and opportunity_id = cast(:o as uuid)", u=user.id, o=oid):
        raise conflict("You are already tracking this opportunity")
    app_id = db.val("insert into public.applications (student_id, opportunity_id, status) values (cast(:u as uuid), cast(:o as uuid), cast(:s as public.application_status)) returning id::text",
                    u=user.id, o=oid, s=body.status)
    _track(db, user.id, oid, r, body.status, is_new=True)
    log_activity(db, user.id, "application_status_changed", f"Started tracking {r['title']} ({body.status})", "/applications")
    return svc.get_one(db, user.id, app_id)


@router.get("/{application_id}", response_model=ApplicationOut)
def get_application(application_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    a = svc.get_one(db, user.id, parse_uuid(application_id, "application"))
    if not a:
        raise not_found("Application")
    return a


@router.patch("/{application_id}", response_model=ApplicationOut)
def update_application(application_id: str, body: ApplicationPatch, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    aid = parse_uuid(application_id, "application")
    cur = svc.get_one(db, user.id, aid, with_timeline=False)
    if not cur:
        raise not_found("Application")
    data = body.model_dump(exclude_unset=True)
    if data:
        sets = []
        if "status" in data: sets.append("status = cast(:status as public.application_status)")
        if "notes" in data: sets.append("notes = :notes")
        if "next_action" in data: sets.append("next_action = :next_action")
        if "reminder_at" in data: sets.append("reminder_at = :reminder_at")
        db.run(f"update public.applications set {', '.join(sets)} where id = cast(:i as uuid) and student_id = cast(:u as uuid)", i=aid, u=user.id, **data)
        if "status" in data and data["status"] != cur["status"]:
            r = catalog.get_one(db, cur["opportunity"]["id"])
            _track(db, user.id, cur["opportunity"]["id"], r, data["status"], is_new=False)
            log_activity(db, user.id, "application_status_changed", f"{cur['opportunity']['title']}: {cur['status']} → {data['status']}", "/applications")
    return svc.get_one(db, user.id, aid)


@router.delete("/{application_id}", status_code=204)
def delete_application(application_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    if not db.run("delete from public.applications where id = cast(:i as uuid) and student_id = cast(:u as uuid)", i=parse_uuid(application_id, "application"), u=user.id):
        raise not_found("Application")
    return Response(status_code=204)


def _track(db: Db, uid: str, oid: str, r: dict | None, status: str, is_new: bool) -> None:
    if is_new:
        events.record(db, uid, "application_start", oid, {"status": status})
    if status == "applied":
        events.record(db, uid, "application_submit", oid)
        if r:
            s, ctx = fitsvc.load_context(db, uid)
            with db.service():
                db.run("insert into public.recommendation_events (student_id, opportunity_id, event_type, fit_score) values (cast(:u as uuid), cast(:o as uuid), 'applied', :f)",
                       u=uid, o=oid, f=score_fit(s, catalog.to_signals(r), ctx).overall)
