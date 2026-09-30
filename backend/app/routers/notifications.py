from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import Field

from ..core.errors import not_found
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.common import ApiModel, Ok
from ..services import notifications as svc
from ..services.common import parse_uuid

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationOut(ApiModel):
    id: str
    kind: str
    title: str
    body: str
    link: Optional[str] = None
    read: bool
    created_at: dt.datetime


class NotificationPage(ApiModel):
    items: list[NotificationOut]
    total: int
    unread: int
    page: int
    page_size: int


class PreferencesIn(ApiModel):
    high_fit: Optional[bool] = None
    smart_alert: Optional[bool] = None
    deadline: Optional[bool] = None
    application_update: Optional[bool] = None
    team_event: Optional[bool] = None
    originality_review: Optional[bool] = None
    min_fit_for_notify: Optional[float] = Field(None, ge=0, le=100)


class PreferencesOut(ApiModel):
    high_fit: bool
    smart_alert: bool
    deadline: bool
    application_update: bool
    team_event: bool
    originality_review: bool
    min_fit_for_notify: float


@router.get("", response_model=NotificationPage)
def list_notifications(unread: bool = False, page: int = Query(1, ge=1, le=1000), page_size: int = Query(20, ge=1, le=100),
                       user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    where = "student_id = cast(:u as uuid)" + (" and read_at is null" if unread else "")
    rows = db.all(f"select id::text as id, kind, title, body, link, (read_at is not null) as read, created_at from public.notifications where {where} order by created_at desc limit :l offset :o",
                  u=user.id, l=page_size, o=(page - 1) * page_size)
    return {"items": rows, "total": db.val(f"select count(*) from public.notifications where {where}", u=user.id),
            "unread": db.val("select count(*) from public.notifications where student_id = cast(:u as uuid) and read_at is null", u=user.id), "page": page, "page_size": page_size}


@router.get("/unread-count")
def unread_count(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return {"unread": db.val("select count(*) from public.notifications where student_id = cast(:u as uuid) and read_at is null", u=user.id)}


@router.post("/read-all", response_model=Ok)
def read_all(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    db.run("update public.notifications set read_at = now() where student_id = cast(:u as uuid) and read_at is null", u=user.id)
    return {"ok": True}


@router.get("/preferences", response_model=PreferencesOut)
def get_prefs(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return svc.get_preferences(db, user.id)


@router.put("/preferences", response_model=PreferencesOut)
def put_prefs(body: PreferencesIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return svc.set_preferences(db, user.id, body.model_dump(exclude_unset=True))


@router.post("/{notification_id}/read", response_model=Ok)
def mark_read(notification_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    nid = parse_uuid(notification_id, "notification")
    # RLS already hides other users' rows; the explicit filter keeps the intent obvious.
    if not db.run("update public.notifications set read_at = coalesce(read_at, now()) where id = cast(:i as uuid) and student_id = cast(:u as uuid)", i=nid, u=user.id):
        raise not_found("Notification")
    return {"ok": True}
