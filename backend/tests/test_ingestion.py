import datetime as dt

import httpx
import pytest

from app.db.session import open_db
from app.ingestion.normalize import canonical_url, norm_title
from app.ingestion.pipeline import run_source
from app.ingestion.sources.base import OpportunitySource
from app.ingestion.sources.feeds import JsonFeedSource, PoliteFetcher
from app.ingestion.sources.fixture import FixtureSource
from app.ingestion.models import RawRecord


class ListSource(OpportunitySource):
    kind = "fixture"

    def __init__(self, key, records, kind="fixture", hosts=()):
        self.key, self.name, self.kind, self._r, self.official_hosts = key, f"Test {key}", kind, records, frozenset(hosts)

    def fetch(self):
        for i, r in enumerate(self._r):
            yield RawRecord(external_id=r.get("externalId", f"{self.key}-{i}"), data=r, source_url=r.get("officialUrl"))


def rec(**kw):
    base = {"externalId": "x1", "title": "IngestTest Hack", "organization": "IngestTest Org", "requiredSkills": ["python"], "deadline": (dt.date.today() + dt.timedelta(days=20)).isoformat()}
    base.update(kw)
    return base


@pytest.fixture(autouse=True)
def _cleanup(_database):
    yield
    with open_db("service_role") as db:
        db.run("delete from public.opportunities where organization_id in (select id from public.organizations where name like 'IngestTest%')")
        db.run("delete from public.organizations where name like 'IngestTest%'")
        db.run("delete from public.opportunity_sources where key like 'itest-%'")


def test_canonical_url_and_title_normalisation():
    assert canonical_url("HTTP://www.Example.com/a//b/?utm_source=x&id=7#frag") == "https://example.com/a/b?id=7"
    assert canonical_url("javascript:alert(1)") is None and canonical_url("ftp://x.com") is None
    assert norm_title("  AI  Hack-a-thon!! 2026 ") == "ai hack a thon 2026"


def test_fixture_load_is_marked_demo_and_idempotent(_database):
    with open_db("service_role") as db:
        first = run_source(db, FixtureSource())
        again = run_source(db, FixtureSource())
        rows = db.all("select source_type::text st, verification_status vs, freshness_status fs, difficulty, format, participation from public.opportunities where source = 'Demo data (local fixtures)'")
    assert first.inserted + first.updated >= 64
    assert again.inserted == 0 and again.updated >= 64 and again.rejected == 0
    assert len(rows) == 64 and {r["st"] for r in rows} == {"dev_seed"} and {r["vs"] for r in rows} == {"unverified"}
    # unknown stays NULL: internships never state an event format, uncategorised items never state participation
    assert sum(1 for r in rows if r["format"] is None) >= 5 and sum(1 for r in rows if r["participation"] is None) >= 5
    assert all(r["fs"] in ("fresh", "unknown") for r in rows)


def test_duplicate_by_canonical_url_keeps_one_row_and_both_sources(_database):
    a = ListSource("itest-a", [rec(officialUrl="https://www.ingesttest.org/hack?utm_source=a", location=None)])
    b = ListSource("itest-b", [rec(externalId="zz", title="A different title entirely", officialUrl="https://ingesttest.org/hack/", location="Pune", difficulty="advanced")])
    with open_db("service_role") as db:
        run_source(db, a)
        st = run_source(db, b)
        opps = db.all("select id::text, location, difficulty::text d, title from public.opportunities where canonical_url = 'https://ingesttest.org/hack'")
        links = db.val("select count(*) from public.opportunity_source_links l join public.opportunities o on o.id = l.opportunity_id where o.canonical_url = 'https://ingesttest.org/hack'")
    assert st.duplicates == 1 and st.inserted == 0
    assert len(opps) == 1 and links == 2
    assert opps[0]["title"] == "IngestTest Hack"            # first record's title is never clobbered
    assert opps[0]["location"] == "Pune" and opps[0]["d"] == "advanced"   # NULL fields were filled from the second source


def test_duplicate_by_org_title_and_close_deadline_but_not_far_deadline(_database):
    base = dt.date.today() + dt.timedelta(days=20)
    with open_db("service_role") as db:
        run_source(db, ListSource("itest-c", [rec(title="IngestTest Cup 2026", deadline=base.isoformat())]))
        near = run_source(db, ListSource("itest-d", [rec(externalId="n", title="ingesttest CUP 2026!", deadline=(base + dt.timedelta(days=3)).isoformat())]))
        far = run_source(db, ListSource("itest-e", [rec(externalId="f", title="IngestTest Cup 2026", deadline=(base + dt.timedelta(days=200)).isoformat())]))
    assert near.duplicates == 1 and near.inserted == 0
    assert far.inserted == 1     # a later edition of a yearly event is a different opportunity


class FakeEmbedder:
    name, dim = "fake", 384

    def encode(self, texts):
        out = []
        for t in texts:
            v = [0.0] * 384
            v[0 if "robot" in t.lower() else 1] = 1.0
            out.append(v)
        return out


def test_semantic_duplicate_within_same_org(_database):
    with open_db("service_role") as db:
        run_source(db, ListSource("itest-f", [rec(title="IngestTest Robot Rally", description="robot competition")]), embedder=FakeEmbedder())
        st = run_source(db, ListSource("itest-g", [rec(externalId="s", title="IngestTest Robotics Showdown", description="a robot contest", deadline=None)]), embedder=FakeEmbedder())
        other = run_source(db, ListSource("itest-h", [rec(externalId="o", title="IngestTest Cooking Jam", description="food")]), embedder=FakeEmbedder())
    assert st.duplicates == 1 and other.inserted == 1


def test_invalid_records_are_rejected_with_reasons_and_valid_ones_still_load(_database):
    src = ListSource("itest-i", [
        rec(externalId="ok"), rec(externalId="notitle", title=""), rec(externalId="baddiff", title="IngestTest Bad Difficulty", difficulty="godlike"),
        rec(externalId="dates", title="IngestTest Dates", registration_start="2026-12-01", deadline="2026-11-01"),
        rec(externalId="team", title="IngestTest Team", minTeamSize=5, maxTeamSize=2),
    ])
    with open_db("service_role") as db:
        st = run_source(db, src)
        run = db.one("select status, detail from public.ingestion_runs order by started_at desc limit 1")
    assert st.inserted == 1 and st.rejected == 4 and run["status"] == "partial"
    assert {r["externalId"] for r in run["detail"]["rejections"]} == {"notitle", "baddiff", "dates", "team"}


def test_official_feed_verification_requires_official_host(_database):
    recs = [rec(externalId="v1", title="IngestTest Verified", officialUrl="https://events.ingesttest.org/a"),
            rec(externalId="v2", title="IngestTest Unverified", officialUrl="https://other-site.com/a")]
    with open_db("service_role") as db:
        db.run("insert into public.opportunity_sources (key, name, kind, enabled) values ('itest-v', 'Test itest-v', 'official_feed', true) on conflict do nothing")
        run_source(db, ListSource("itest-v", recs, kind="official_feed", hosts={"ingesttest.org"}))
        rows = {r["title"]: r for r in db.all("select title, verification_status vs, source_type::text st, last_verified_at from public.opportunities where title like 'IngestTest Verified' or title like 'IngestTest Unverified'")}
    assert rows["IngestTest Verified"]["vs"] == "verified" and rows["IngestTest Verified"]["last_verified_at"] is not None
    assert rows["IngestTest Unverified"]["vs"] == "unverified" and rows["IngestTest Unverified"]["st"] == "official"


def test_real_sources_are_disabled_until_reviewed(_database):
    src = ListSource("itest-real", [rec()], kind="official_feed")
    with open_db("service_role") as db:
        with pytest.raises(PermissionError):
            run_source(db, src)


def _transport(routes):
    def handler(req: httpx.Request):
        return routes.get(str(req.url), httpx.Response(404))
    return httpx.MockTransport(handler)


def test_polite_fetcher_honours_robots_and_rate_limit():
    routes = {"https://feed.test/robots.txt": httpx.Response(200, text="User-agent: *\nDisallow: /private/\n"),
              "https://feed.test/ok.json": httpx.Response(200, json={"items": [{"id": "1", "title": "T"}]}),
              "https://feed.test/private/x.json": httpx.Response(200, json={})}
    sleeps = []
    f = PoliteFetcher(rate_limit_per_min=6, transport=_transport(routes), sleep=sleeps.append)
    assert f.get("https://feed.test/ok.json").json()["items"][0]["id"] == "1"
    with pytest.raises(PermissionError):
        f.get("https://feed.test/private/x.json")
    f.get("https://feed.test/ok.json")
    assert sleeps and sleeps[-1] > 5         # 6/min => ~10s spacing


def test_robots_forbidden_or_unreachable_means_do_not_fetch_and_run_fails_cleanly(_database):
    routes = {"https://blocked.test/robots.txt": httpx.Response(403)}
    fetcher = PoliteFetcher(transport=_transport(routes), sleep=lambda s: None)
    src = JsonFeedSource("itest-blocked", "Blocked", "https://blocked.test/feed.json", fetcher=fetcher)
    with open_db("service_role") as db:
        db.run("insert into public.opportunity_sources (key, name, kind, enabled) values ('itest-blocked', 'Blocked', 'official_feed', true) on conflict do nothing")
        st = run_source(db, src)
        run = db.one("select status, error from public.ingestion_runs order by started_at desc limit 1")
    assert st.status == "failed" and run["status"] == "failed" and "robots" in run["error"].lower()


def test_registry_lists_sources_and_rejects_unknown_ones():
    from app.ingestion.registry import SOURCES, get_source
    assert "dev-fixtures" in SOURCES and get_source("dev-fixtures").kind == "fixture"
    with pytest.raises(ValueError) as e:
        get_source("nope")
    assert "dev-fixtures" in str(e.value) and "registry.py" in str(e.value)
