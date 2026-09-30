"""Scheduler abstraction. Two interchangeable implementations:

* ExternalCronScheduler  — default. A real cron (Render/Railway cron, GitHub Actions, Supabase pg_cron+pg_net, Vercel cron)
  calls POST /api/internal/jobs/{name} with X-Cron-Secret. Nothing runs inside the API process.
* IntervalScheduler      — SCHEDULER_ENABLED=true: a daemon thread runs the jobs on an interval (single-instance deployments,
  local demos). The advisory lock in runner.run_job keeps multiple instances from double-running.
"""
from __future__ import annotations

import threading
from typing import Protocol

from ..core.logging import get_logger
from .runner import run_job

log = get_logger("scheduler")
DEFAULT_SCHEDULE = {"sql": 30 * 60, "alerts": 15 * 60}     # seconds


class Scheduler(Protocol):
    def start(self) -> None: ...
    def stop(self) -> None: ...


class ExternalCronScheduler:
    def start(self) -> None:
        log.info("scheduler: external cron (POST /api/internal/jobs/{name})")

    def stop(self) -> None: ...


class IntervalScheduler:
    def __init__(self, schedule: dict[str, int] | None = None):
        self.schedule, self._stop, self._threads = schedule or DEFAULT_SCHEDULE, threading.Event(), []

    def _loop(self, name: str, every: int) -> None:
        while not self._stop.wait(every):
            try:
                run_job(name)
            except Exception:
                pass    # run_job already logged

    def start(self) -> None:
        for name, every in self.schedule.items():
            t = threading.Thread(target=self._loop, args=(name, every), daemon=True, name=f"job-{name}")
            t.start(); self._threads.append(t)
        log.info("scheduler: in-process", extra={"count": len(self._threads)})

    def stop(self) -> None:
        self._stop.set()


def make_scheduler(enabled: bool) -> Scheduler:
    return IntervalScheduler() if enabled else ExternalCronScheduler()
