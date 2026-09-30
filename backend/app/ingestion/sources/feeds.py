"""Generic adapters for *official* JSON / RSS feeds. Disabled by default: an admin enables a source only after
reviewing its terms and robots.txt (recorded in opportunity_sources.robots_reviewed_at)."""
from __future__ import annotations

import time
import urllib.robotparser
from typing import Callable, Iterable
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

import httpx

from ...core.logging import get_logger
from ..models import RawRecord
from .base import OpportunitySource

log = get_logger("ingestion")
USER_AGENT = "NirmaanBot/1.0 (+https://nirmaan.app/bot; student opportunity discovery; contact via site)"
MAX_BYTES = 5 * 1024 * 1024


class PoliteFetcher:
    """robots.txt + per-host rate limit + timeout + size cap. `transport` is injectable for tests."""

    def __init__(self, rate_limit_per_min: int = 10, transport: httpx.BaseTransport | None = None, sleep: Callable[[float], None] = time.sleep):
        self.min_interval = 60.0 / max(rate_limit_per_min, 1)
        self.client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=10.0, follow_redirects=True, transport=transport)
        self._last: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._sleep = sleep

    def _allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.client.get(f"{host}/robots.txt")
                if r.status_code in (401, 403):
                    self._robots[host] = None; return False           # explicitly forbidden → do not crawl
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
                self._robots[host] = rp
            except httpx.HTTPError:
                self._robots[host] = None; return False               # cannot verify policy → do not crawl
        rp = self._robots[host]
        return bool(rp and rp.can_fetch(USER_AGENT, url))

    def get(self, url: str) -> httpx.Response:
        if not self._allowed(url):
            raise PermissionError(f"robots.txt does not allow fetching {url}")
        host = urlsplit(url).netloc
        wait = self._last.get(host, 0) + self.min_interval - time.monotonic()
        if wait > 0:
            self._sleep(wait)
        self._last[host] = time.monotonic()
        r = self.client.get(url)
        r.raise_for_status()
        if len(r.content) > MAX_BYTES:
            raise ValueError("response too large")
        return r


class JsonFeedSource(OpportunitySource):
    """Expects `{"items": [{"id": ..., "title": ..., ...}]}` (or a bare list) and a `mapping` from feed fields to ours."""

    def __init__(self, key: str, name: str, url: str, kind: str = "official_feed", mapping: dict | None = None,
                 official_hosts: set[str] | None = None, fetcher: PoliteFetcher | None = None):
        self.key, self.name, self.kind, self.url = key, name, kind, url
        self.mapping, self.official_hosts, self.fetcher = mapping or {}, frozenset(official_hosts or ()), fetcher or PoliteFetcher()

    def fetch(self) -> Iterable[RawRecord]:
        payload = self.fetcher.get(self.url).json()
        for it in payload["items"] if isinstance(payload, dict) else payload:
            data = {ours: it.get(theirs) for ours, theirs in self.mapping.items()} if self.mapping else dict(it)
            ext = str(it.get("id") or it.get("guid") or data.get("officialUrl") or data.get("title"))
            yield RawRecord(external_id=ext, data=data, source_url=data.get("officialUrl"))


class RssFeedSource(OpportunitySource):
    def __init__(self, key: str, name: str, url: str, kind: str = "official_feed", organization: str | None = None,
                 official_hosts: set[str] | None = None, fetcher: PoliteFetcher | None = None):
        self.key, self.name, self.kind, self.url, self.organization = key, name, kind, url, organization or name
        self.official_hosts, self.fetcher = frozenset(official_hosts or ()), fetcher or PoliteFetcher()

    def fetch(self) -> Iterable[RawRecord]:
        root = ET.fromstring(self.fetcher.get(self.url).content)      # defusedxml would be stricter; stdlib expat blocks external entities by default
        for item in root.iter("item"):
            g = lambda tag: (item.findtext(tag) or "").strip() or None
            link = g("link")
            yield RawRecord(external_id=g("guid") or link or g("title") or "?", source_url=link,
                            data={"title": g("title"), "description": g("description"), "officialUrl": link, "organization": self.organization})
