"""CLI: python -m app.jobs {sql|alerts|ingest} [--source dev-fixtures]  — manual trigger for testing and cron."""
import argparse
import json
import sys

from ..core.config import get_settings
from ..core.logging import configure_logging
from .runner import JOBS, run_job

p = argparse.ArgumentParser(prog="python -m app.jobs")
p.add_argument("job", choices=sorted(JOBS))
p.add_argument("--source", default="dev-fixtures")
a = p.parse_args()
s = get_settings()
configure_logging(s.log_level, s.log_json)
try:
    print(json.dumps(run_job(a.job, source=a.source) if a.job == "ingest" else run_job(a.job), indent=2, default=str))
except Exception as exc:
    print(f"job failed: {type(exc).__name__}: {exc}", file=sys.stderr)
    sys.exit(1)
