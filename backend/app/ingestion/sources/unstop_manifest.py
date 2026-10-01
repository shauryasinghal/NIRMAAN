"""Reviewed, facts-only manifest of public Unstop opportunity pages — a TEMPORARY bridge until an authorised Unstop feed exists.

Nothing is fetched at runtime: the manifest (fixtures/unstop/manifest.json) was compiled by hand from public pages at low
volume and holds only facts (title, organiser name, type, deadline, format, location, team size, listing URL) — no
descriptions, images, logos or organiser text. Unstop is an aggregator, so records are stored as source_type='aggregator',
verification_status='unverified' and link back to the Unstop listing; users are told to confirm on the original page.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit

from ..models import RawRecord
from .base import OpportunitySource

MANIFEST = Path(__file__).resolve().parents[3] / "fixtures" / "unstop" / "manifest.json"
REQUIRED = ("sourceId", "title", "organization", "type", "deadline", "url")


class UnstopManifestSource(OpportunitySource):
    key, name, kind = "unstop", "Unstop", "public_listing"
    official_hosts = frozenset()        # an aggregator listing is never "verified" as the organiser's own page

    def __init__(self, path: Path | str | None = None):
        self.path = Path(path) if path else MANIFEST

    def fetch(self) -> Iterable[RawRecord]:
        doc = json.loads(self.path.read_text())
        if doc.get("source") != self.key:
            raise ValueError(f"manifest source is {doc.get('source')!r}, expected {self.key!r}")
        seen: set[str] = set()
        for item in doc["records"]:
            missing = [k for k in REQUIRED if not item.get(k)]
            if missing:
                raise ValueError(f"manifest record {item.get('sourceId')!r} is missing {', '.join(missing)}")
            sid, url = str(item["sourceId"]), item["url"]
            parts = urlsplit(url)
            if parts.scheme != "https" or parts.netloc != "unstop.com" or not re.search(rf"-{re.escape(sid)}$", parts.path):
                raise ValueError(f"manifest record {sid}: URL is not the unstop.com page for that id")
            if sid in seen:
                raise ValueError(f"manifest record {sid} is duplicated")
            seen.add(sid)
            data = {
                "title": item["title"], "organization": item["organization"], "category": item["type"], "deadline": item["deadline"],
                "format": item.get("format"), "location": item.get("location"), "participation": item.get("participation"),
                "minTeamSize": item.get("minTeamSize"), "maxTeamSize": item.get("maxTeamSize"), "officialUrl": url,
            }
            yield RawRecord(external_id=sid, data=data, source_url=url)
