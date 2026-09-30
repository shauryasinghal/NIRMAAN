"""Local JSON fixtures — the development / demo source. Deadlines are stored as day offsets from *today*
so demo data never drifts into the past. Everything loaded from here is stored as source_type='dev_seed'
and rendered with a "Demo data" badge; it is never presented as live, verified information."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Iterable

from ..models import RawRecord
from .base import OpportunitySource

FIXTURE_DIR = Path(__file__).resolve().parents[3] / "fixtures"


class FixtureSource(OpportunitySource):
    kind = "fixture"

    def __init__(self, path: Path | str | None = None, key: str = "dev-fixtures", today: dt.date | None = None):
        self.path = Path(path) if path else FIXTURE_DIR / "opportunities.dev.json"
        self.key, self.name = key, "Demo data (local fixtures)"
        self.today = today or dt.date.today()

    def fetch(self) -> Iterable[RawRecord]:
        for item in json.loads(self.path.read_text()):
            item = dict(item)
            for field, offset in (("deadlineInDays", "deadline"), ("startsInDays", "event_start"), ("endsInDays", "event_end"), ("opensInDays", "registration_start")):
                if field in item:
                    item[offset] = (self.today + dt.timedelta(days=int(item.pop(field)))).isoformat()
            yield RawRecord(external_id=item["externalId"], data=item, source_url=None)
