"""Source adapters: the only place that knows *where* data comes from.

Adding a source = subclass OpportunitySource, implement fetch() (yield RawRecord). Nothing else changes.
Rules every real adapter must follow (enforced by PoliteFetcher): honour robots.txt, rate-limit, identify
ourselves, cap response size, and prefer official APIs/feeds over scraping HTML.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable

from ..models import RawRecord


class OpportunitySource(ABC):
    key: str = ""
    name: str = ""
    kind: str = ""                 # official_api | official_feed | partner | public_listing | fixture
    official_hosts: frozenset[str] = frozenset()   # hosts whose URLs may be marked "verified"

    @abstractmethod
    def fetch(self) -> Iterable[RawRecord]:
        """Yield raw records. Must not write to the database."""

    def describe(self) -> dict:
        return {"key": self.key, "name": self.name, "kind": self.kind}
