"""Background jobs, runnable from a scheduler, the cron endpoint, or the CLI (`python -m app.jobs <name>`).
Each run holds a Postgres advisory lock so overlapping instances never double-run the same job."""
from __future__ import annotations

import hashlib
import time

from ..core.logging import get_logger
from ..db.session import Db, open_db

log = get_logger("jobs")


def _lock_key(name: str) -> int:
    return int.from_bytes(hashlib.sha256(f"nirmaan-job:{name}".encode()).digest()[:7], "big")


def job_sql(db: Db, **_) -> dict:
    with db.service():
        return db.val("select private.run_scheduled_sql_jobs()")


def job_alerts(db: Db, **_) -> dict:
    from ..services import alerts
    return alerts.evaluate_all(db)


def job_ingest(db: Db, source: str = "dev-fixtures", **_) -> dict:
    from ..ingestion.pipeline import run_source
    from ..ingestion.sources.fixture import FixtureSource
    from ..services import alerts
    if source != "dev-fixtures":
        raise ValueError(f"Unknown source '{source}'. Register real sources in app/ingestion/registry.py after reviewing their terms.")
    stats = run_source(db, FixtureSource())
    out = {"status": stats.status, "fetched": stats.fetched, "inserted": stats.inserted, "updated": stats.updated, "duplicates": stats.duplicates, "rejected": stats.rejected}
    if stats.new_ids:
        out["alerts"] = alerts.evaluate_all(db, only_ids=stats.new_ids)
        out["highFit"] = alerts.notify_high_fit(db, stats.new_ids)
    return out


JOBS = {"sql": job_sql, "alerts": job_alerts, "ingest": job_ingest}


def run_job(name: str, **kwargs) -> dict:
    if name not in JOBS:
        raise KeyError(name)
    start = time.perf_counter()
    with open_db("service_role") as db:
        if not db.val("select pg_try_advisory_xact_lock(:k)", k=_lock_key(name)):
            log.info("job skipped (already running elsewhere)", extra={"event": "job_skipped", "source": name})
            return {"skipped": True, "reason": "already running"}
        try:
            result = JOBS[name](db, **kwargs)
        except Exception as exc:
            log.error("job failed", extra={"event": "job_failed", "source": name, "code": type(exc).__name__})
            raise
    log.info("job finished", extra={"event": "job_finished", "source": name, "durationMs": round((time.perf_counter() - start) * 1000, 1)})
    return {"job": name, "durationMs": round((time.perf_counter() - start) * 1000, 1), **result}
