"""Behavioural events — the only inputs to personalisation besides the profile. Users can see them all
(GET /api/activity/signals) and they are deleted with the account."""
from __future__ import annotations

import json

from ..db.session import Db


def record(db: Db, user_id: str, event_type: str, opportunity_id: str | None = None, payload: dict | None = None, dedupe_minutes: int = 0) -> None:
    if dedupe_minutes and opportunity_id and db.val(
        "select 1 from public.user_events where student_id = cast(:u as uuid) and event_type = :t and opportunity_id = cast(:o as uuid) and created_at > now() - make_interval(mins => :m) limit 1",
        u=user_id, t=event_type, o=opportunity_id, m=dedupe_minutes,
    ):
        return
    db.run("insert into public.user_events (student_id, event_type, opportunity_id, payload) values (cast(:u as uuid), :t, cast(:o as uuid), cast(:p as jsonb))",
           u=user_id, t=event_type, o=opportunity_id, p=json.dumps(payload or {}))
