"""The temporary facts-only Unstop manifest, through the REAL ingestion pipeline (scratch database, never hosted)."""
import json

import pytest

from app.db.session import open_db
from app.ingestion.pipeline import run_source
from app.ingestion.registry import get_source
from app.ingestion.sources.unstop_manifest import MANIFEST, UnstopManifestSource

EXPECTED = 50
FACT_KEYS = {"sourceId", "title", "organization", "type", "deadline", "deadlineAt", "format", "location", "minTeamSize", "maxTeamSize", "participation", "url"}


def _manifest():
    return json.loads(MANIFEST.read_text())


def _write(tmp_path, records, source="unstop"):
    p = tmp_path / "m.json"
    p.write_text(json.dumps({"source": source, "records": records}))
    return p


def test_manifest_is_exactly_50_unique_facts_only_records():
    recs = _manifest()["records"]
    assert len(recs) == EXPECTED
    assert len({r["sourceId"] for r in recs}) == EXPECTED and len({r["url"] for r in recs}) == EXPECTED
    assert all(set(r) == FACT_KEYS for r in recs), "manifest must hold facts only — no descriptions, images or logos"
    assert all(r["url"].startswith("https://unstop.com/") and r["url"].endswith("-" + r["sourceId"]) for r in recs)
    assert all(r["type"] in ("Hackathon", "Competition") for r in recs)


def test_adapter_contract_and_registry():
    src = get_source("unstop")
    assert (src.key, src.name, src.kind, src.official_hosts) == ("unstop", "Unstop", "public_listing", frozenset())
    raws = list(src.fetch())
    assert len(raws) == EXPECTED and all(r.source_url == r.data["officialUrl"] and "description" not in r.data for r in raws)


@pytest.mark.parametrize("mutate,msg", [
    (lambda r: r.pop("title"), "missing title"),
    (lambda r: r.update(url="https://evil.example/x-1"), "not the unstop.com page"),
    (lambda r: r.update(url="https://unstop.com/hackathons/x-999"), "not the unstop.com page"),
])
def test_adapter_rejects_malformed_records(tmp_path, mutate, msg):
    rec = dict(_manifest()["records"][0])
    mutate(rec)
    with pytest.raises(ValueError, match=msg):
        list(UnstopManifestSource(_write(tmp_path, [rec])).fetch())


def test_adapter_rejects_duplicates_and_foreign_source(tmp_path):
    rec = _manifest()["records"][0]
    with pytest.raises(ValueError, match="duplicated"):
        list(UnstopManifestSource(_write(tmp_path, [rec, rec])).fetch())
    with pytest.raises(ValueError, match="expected 'unstop'"):
        list(UnstopManifestSource(_write(tmp_path, [rec], source="other")).fetch())


@pytest.fixture
def _unstop_cleanup(_database):
    def clean():
        with open_db("service_role") as db:
            db.run("delete from public.opportunities where source = 'Unstop'")
            db.run("delete from public.opportunity_sources where key = 'unstop'")
            db.run("delete from public.organizations o where o.name = any(cast(:n as text[])) and not exists (select 1 from public.opportunities p where p.organization_id = o.id)",
                   n=sorted({r["organization"] for r in _manifest()["records"]}))
    clean()
    yield
    clean()


def test_unstop_is_disabled_until_reviewed(_unstop_cleanup):
    with open_db("service_role") as db:
        with pytest.raises(PermissionError):
            run_source(db, UnstopManifestSource())
        assert db.val("select count(*) from public.opportunities where source = 'Unstop'") == 0


def test_import_is_unverified_aggregator_and_idempotent(_unstop_cleanup):
    recs = _manifest()["records"]
    with open_db("service_role") as db:
        db.run("insert into public.opportunity_sources (key, name, kind, enabled, robots_reviewed_at) values ('unstop', 'Unstop', 'public_listing', true, now())")
        first = run_source(db, UnstopManifestSource())
        snap1 = db.all("select source_ref, title, deadline, category, format, participation, min_team_size, max_team_size, location, external_url, description, verification_status, source_type::text st, last_verified_at, status from public.opportunities where source = 'Unstop' order by source_ref")
        second = run_source(db, UnstopManifestSource())
        third = run_source(db, UnstopManifestSource())
        snap3 = db.all("select source_ref, title, deadline, category, format, participation, min_team_size, max_team_size, location, external_url, description, verification_status, source_type::text st, last_verified_at, status from public.opportunities where source = 'Unstop' order by source_ref")
        links = db.val("select count(*) from public.opportunity_source_links l join public.opportunity_sources s on s.id = l.source_id where s.key = 'unstop'")
        skills = db.val("select count(*) from public.opportunity_skills k join public.opportunities o on o.id = k.opportunity_id where o.source = 'Unstop'")
    assert (first.fetched, first.inserted, first.updated, first.duplicates, first.rejected) == (EXPECTED, EXPECTED, 0, 0, 0), first.rejections
    assert (second.inserted, second.duplicates, second.rejected, second.updated) == (0, 0, 0, EXPECTED)
    assert (third.inserted, third.duplicates, third.rejected, third.updated) == (0, 0, 0, EXPECTED)
    assert len(snap1) == EXPECTED and snap1 == snap3 and links == EXPECTED and skills == 0
    assert {r["verification_status"] for r in snap1} == {"unverified"} and {r["st"] for r in snap1} == {"aggregator"}
    assert {r["last_verified_at"] for r in snap1} == {None} and {r["status"] for r in snap1} == {"active"} and {r["description"] for r in snap1} == {""}
    by_id = {r["source_ref"]: r for r in snap1}
    for m in recs:                                  # facts in → same facts out, nothing invented
        r = by_id[m["sourceId"]]
        assert (r["title"], r["external_url"], r["category"], r["format"], r["participation"], r["min_team_size"], r["max_team_size"], r["location"]) == \
               (" ".join(m["title"].split()), m["url"], m["type"], m["format"], m["participation"], m["minTeamSize"], m["maxTeamSize"], m["location"])
        assert r["deadline"].isoformat() == m["deadline"]
