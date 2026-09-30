from __future__ import annotations

from ..db.session import Db
from .common import today
from .presenters import urgency

BASE = """select a.id::text as id, a.status::text as status, a.notes, a.next_action, a.reminder_at, a.created_at, a.updated_at,
       o.id::text as opp_id, o.title, o.deadline, o.category, org.name as organization, (o.source_type = 'dev_seed') as is_demo
  from public.applications a join public.opportunities o on o.id = a.opportunity_id join public.organizations org on org.id = o.organization_id"""


def shape(r: dict) -> dict:
    u = urgency(r["deadline"])
    return {"id": r["id"], "status": r["status"], "notes": r["notes"], "next_action": r["next_action"], "reminder_at": r["reminder_at"],
            "created_at": r["created_at"], "updated_at": r["updated_at"],
            "opportunity": {"id": r["opp_id"], "title": r["title"], "organization": r["organization"], "category": r["category"],
                            "deadline": r["deadline"], "days_remaining": u["days_remaining"], "urgency": u["urgency"], "is_expired": u["is_expired"], "is_demo": r["is_demo"]}}


def list_for(db: Db, user_id: str, status: str | None = None) -> list[dict]:
    rows = db.all(BASE + " where a.student_id = cast(:u as uuid)" + (" and a.status = cast(:s as public.application_status)" if status else "") + " order by a.updated_at desc", u=user_id, s=status)
    return [shape(r) for r in rows]


def get_one(db: Db, user_id: str, app_id: str, with_timeline: bool = True) -> dict | None:
    r = db.one(BASE + " where a.id = cast(:i as uuid) and a.student_id = cast(:u as uuid)", i=app_id, u=user_id)
    if not r:
        return None
    out = shape(r)
    if with_timeline:
        out["timeline"] = db.all("select id::text as id, kind, detail, created_at from public.application_events where application_id = cast(:i as uuid) order by created_at, id", i=app_id)
    return out


def insights(db: Db, user_id: str) -> list[dict]:
    """Stalled = early stage with no change for 5+ days (real updated_at). Urgent = linked deadline ≤ 10 days while not submitted."""
    out = []
    for r in db.all(BASE.replace("select ", "select (extract(epoch from (now() - a.updated_at))/86400)::int as idle_days, ") + " where a.student_id = cast(:u as uuid) and a.status in ('wishlist','saved','planning','applying')", u=user_id):
        u = urgency(r["deadline"])
        if r["idle_days"] >= 5:
            out.append({"applicationId": r["id"], "title": r["title"], "kind": "stalled", "detail": f"Still '{r['status']}' after {r['idle_days']} days with no update."})
        if u["urgency"] in ("critical", "soon"):
            out.append({"applicationId": r["id"], "title": r["title"], "kind": "urgent", "detail": f"Closes in {u['days_remaining']} day(s) and is not submitted yet."})
    return out
