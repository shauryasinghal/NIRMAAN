from __future__ import annotations

import datetime as dt
import hmac
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, Response
from pydantic import ConfigDict, Field

from ..core.config import get_settings
from ..core.errors import AppError, forbidden, not_found, unavailable
from ..core.middleware import rate_limit
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..jobs.runner import JOBS, run_job
from ..schemas.common import ApiModel
from ..services import alerts as svc, events
from ..services.activity import log_activity
from ..services.common import parse_uuid

router = APIRouter(prefix="/api/alerts", tags=["alerts"])
internal = APIRouter(prefix="/api/internal", tags=["internal"], include_in_schema=False)


class AlertIn(ApiModel):
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    name: str = Field(min_length=1, max_length=80)
    query: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=80)
    domain: Optional[str] = Field(None, max_length=80)
    skill: Optional[str] = Field(None, max_length=60)
    location: Optional[str] = Field(None, max_length=160)
    work_mode: Optional[Literal["remote", "onsite", "hybrid"]] = None
    participation: Optional[Literal["individual", "team"]] = None
    deadline_within_days: Optional[int] = Field(None, ge=1, le=365)
    min_fit: Optional[float] = Field(None, ge=0, le=100)
    enabled: Optional[bool] = None


class AlertPatch(AlertIn):
    name: Optional[str] = Field(None, min_length=1, max_length=80)


class AlertOut(ApiModel):
    id: str
    name: str
    query: str
    category: Optional[str] = None
    domain: Optional[str] = None
    skill: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[str] = None
    participation: Optional[str] = None
    deadline_within_days: Optional[int] = None
    min_fit: Optional[float] = None
    enabled: bool
    last_evaluated_at: Optional[dt.datetime] = None
    created_at: dt.datetime
    hit_count: int = 0


def _out(db: Db, uid: str, aid: str) -> dict:
    return next(a for a in svc.list_alerts(db, uid) if a["id"] == aid)


@router.get("", response_model=list[AlertOut])
def list_alerts(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return svc.list_alerts(db, user.id)


@router.post("", response_model=AlertOut, status_code=201)
def create_alert(body: AlertIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    aid = svc.create_alert(db, user.id, body.model_dump(exclude_unset=True))
    events.record(db, user.id, "alert_create", payload={"name": body.name[:60]})
    log_activity(db, user.id, "alert_created", f"Created alert “{body.name}”", "/smart-alerts")
    return _out(db, user.id, aid)


@router.patch("/{alert_id}", response_model=AlertOut)
def update_alert(alert_id: str, body: AlertPatch, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    aid = parse_uuid(alert_id, "alert")
    if not svc.update_alert(db, user.id, aid, body.model_dump(exclude_unset=True)):
        raise not_found("Alert")
    return _out(db, user.id, aid)


@router.delete("/{alert_id}", status_code=204)
def delete_alert(alert_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    if not db.run("delete from public.saved_searches where id = cast(:i as uuid) and student_id = cast(:u as uuid)", i=parse_uuid(alert_id, "alert"), u=user.id):
        raise not_found("Alert")
    return Response(status_code=204)


@router.post("/{alert_id}/evaluate", summary="Evaluate this alert against the current catalog right now",
             dependencies=[Depends(rate_limit("alert-eval", 20))])
def evaluate_now(alert_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    a = svc.get_alert(db, user.id, parse_uuid(alert_id, "alert"))
    if not a:
        raise not_found("Alert")
    return svc.evaluate_alert(db, a)


@router.get("/{alert_id}/hits")
def hits(alert_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    aid = parse_uuid(alert_id, "alert")
    if not svc.get_alert(db, user.id, aid):
        raise not_found("Alert")
    rows = db.all("""select o.id::text as id, o.title, org.name as organization, o.deadline, h.fit_score::float as fit, h.notified_at
                       from public.saved_search_hits h join public.opportunities o on o.id = h.opportunity_id join public.organizations org on org.id = o.organization_id
                      where h.saved_search_id = cast(:a as uuid) order by h.notified_at desc""", a=aid)
    return {"items": [{"opportunityId": r["id"], "title": r["title"], "organization": r["organization"], "deadline": r["deadline"], "fit": r["fit"], "matchedAt": r["notified_at"]} for r in rows]}


@internal.post("/jobs/{name}")
def run_internal_job(name: str, x_cron_secret: str | None = Header(None)):
    secret = get_settings().cron_secret
    if not secret:
        raise unavailable("Scheduled jobs are not configured (set CRON_SECRET)")
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret.encode(), secret.encode()):
        raise forbidden("Invalid cron secret")
    if name not in JOBS:
        raise not_found("Job")
    return run_job(name)
