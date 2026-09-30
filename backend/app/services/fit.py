"""Glue between the DB and the pure fit engine."""
from __future__ import annotations

from ..db.session import Db
from ..engines.recommender import build_affinity, score_fit
from ..engines.types import Affinity, FitContext, FitResult, StudentSignals
from . import catalog
from .common import today
from .profiles import student_signals


def load_affinity(db: Db, user_id: str) -> Affinity:
    events = db.all("""select event_type as type, opportunity_id::text as opportunity_id,
                              (extract(epoch from (now() - created_at)) / 86400.0)::float as days_ago
                         from public.user_events where student_id = cast(:u as uuid) and created_at > now() - interval '120 days'
                        order by created_at desc limit 500""", u=user_id)
    ids = sorted({e["opportunity_id"] for e in events if e["opportunity_id"]})
    index = {}
    if ids:
        index = {r["id"]: catalog.to_signals(r) for r in catalog.search(db, {"ids": ids, "include_expired": True}, "newest", 1, 500)[0]}
    return build_affinity(events, index, today())


def load_context(db: Db, user_id: str) -> tuple[StudentSignals, FitContext]:
    s = student_signals(db, user_id)
    return s, FitContext(today=today(), domain_profiles=catalog.domain_profiles(db), affinity=load_affinity(db, user_id))


def fit_for_rows(rows: list[dict], s: StudentSignals, ctx: FitContext) -> dict[str, FitResult]:
    return {r["id"]: score_fit(s, catalog.to_signals(r), ctx) for r in rows}
