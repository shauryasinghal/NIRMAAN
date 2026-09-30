"""Notifications are only ever created because something real happened (a reviewer decided, an alert matched,
a deadline is near …). Creation runs as service_role (clients cannot insert), honours the user's preferences,
and is idempotent through dedupe_key."""
from __future__ import annotations

from ..db.session import Db

KIND_PREF = {
    "high_fit_opportunity": "high_fit", "smart_alert": "smart_alert", "saved_search_match": "smart_alert",
    "deadline_approaching": "deadline", "application_reminder": "deadline", "application_update": "application_update",
    "team_event": "team_event", "originality_review": "originality_review", "reviewer_decision": "originality_review",
}
PREF_COLUMNS = ["high_fit", "smart_alert", "deadline", "application_update", "team_event", "originality_review"]


def enabled(db: Db, user_id: str, kind: str) -> bool:
    col = KIND_PREF.get(kind)
    if col is None:          # profile_completion, recommendation_update: not user-toggleable
        return True
    v = db.val(f"select {col} from public.notification_preferences where student_id = cast(:u as uuid)", u=user_id)
    return True if v is None else bool(v)


def notify(db: Db, user_id: str, kind: str, title: str, body: str = "", link: str | None = None, dedupe_key: str | None = None) -> bool:
    with db.service():
        if not enabled(db, user_id, kind):
            return False
        return db.run("""insert into public.notifications (student_id, kind, title, body, link, dedupe_key)
                         values (cast(:u as uuid), :k, :t, :b, :l, :d) on conflict (student_id, dedupe_key) do nothing""",
                      u=user_id, k=kind, t=title[:200], b=body[:1000], l=link, d=dedupe_key) > 0


def get_preferences(db: Db, user_id: str) -> dict:
    row = db.one("select high_fit, smart_alert, deadline, application_update, team_event, originality_review, min_fit_for_notify::float as min_fit_for_notify from public.notification_preferences where student_id = cast(:u as uuid)", u=user_id)
    return row or {**{c: True for c in PREF_COLUMNS}, "min_fit_for_notify": 75.0}


def set_preferences(db: Db, user_id: str, data: dict) -> dict:
    cur = get_preferences(db, user_id)
    cur.update({k: v for k, v in data.items() if v is not None and k in (*PREF_COLUMNS, "min_fit_for_notify")})
    db.run("""insert into public.notification_preferences (student_id, high_fit, smart_alert, deadline, application_update, team_event, originality_review, min_fit_for_notify)
              values (cast(:u as uuid), :high_fit, :smart_alert, :deadline, :application_update, :team_event, :originality_review, :min_fit_for_notify)
              on conflict (student_id) do update set high_fit = excluded.high_fit, smart_alert = excluded.smart_alert, deadline = excluded.deadline,
                application_update = excluded.application_update, team_event = excluded.team_event, originality_review = excluded.originality_review,
                min_fit_for_notify = excluded.min_fit_for_notify""", u=user_id, **cur)
    return get_preferences(db, user_id)
