"""Where ingestion sources are registered. Adding a source = write an OpportunitySource (or configure JsonFeedSource /
RssFeedSource) and add ONE line to SOURCES. Nothing else in the pipeline changes.

Before enabling any real source: read its terms, check its robots.txt, prefer an official API/feed, and record the
review by setting opportunity_sources.robots_reviewed_at + enabled = true (the pipeline refuses to run a disabled
source). PoliteFetcher additionally enforces robots.txt, a per-host rate limit, timeouts and a response-size cap.

Example (kept commented on purpose — do not enable without the review above):

    from .sources.feeds import JsonFeedSource
    SOURCES["example-official-feed"] = lambda: JsonFeedSource(
        key="example-official-feed", name="Example Org — official opportunities feed", kind="official_feed",
        url="https://example.org/api/opportunities.json", official_hosts={"example.org"},
        mapping={"title": "name", "organization": "org", "description": "summary", "officialUrl": "url", "deadline": "closes_on"})
"""
from __future__ import annotations

from typing import Callable

from .sources.base import OpportunitySource
from .sources.fixture import FixtureSource
from .sources.unstop_manifest import UnstopManifestSource

SOURCES: dict[str, Callable[[], OpportunitySource]] = {
    "dev-fixtures": FixtureSource,      # demo data only — stored as source_type='dev_seed', shown with a "Demo data" badge
    "unstop": UnstopManifestSource,     # TEMPORARY reviewed facts-only manifest of public Unstop pages (aggregator, unverified); needs enabling in opportunity_sources
}


def get_source(key: str) -> OpportunitySource:
    if key not in SOURCES:
        raise ValueError(f"Unknown source '{key}'. Registered sources: {', '.join(sorted(SOURCES))}. Add new ones in app/ingestion/registry.py after reviewing their terms and robots.txt.")
    return SOURCES[key]()
