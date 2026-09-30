import datetime as dt

import pytest

from app.db.session import open_db
from app.ingestion.pipeline import run_source
from app.ingestion.models import RawRecord
from app.ingestion.sources.base import OpportunitySource


class OneShot(OpportunitySource):
    kind, official_hosts = "fixture", frozenset()

    def __init__(self, key, recs):
        self.key, self.name, self._r = key, "Demo data (test)", recs

    def fetch(self):
        for r in self._r:
            yield RawRecord(external_id=r["externalId"], data=r)


@pytest.fixture(autouse=True)
def _cleanup(_database):
    yield
    with open_db("service_role") as db:
        db.run("delete from public.opportunities where organization_id in (select id from public.organizations where name like 'AlertTest%')")
        db.run("delete from public.organizations where name like 'AlertTest%'")
        db.run("delete from public.opportunity_sources where key like 'atest-%'")


def profile(client, u, **extra):
    body = {"skills": ["python", "machine learning"], "interests": ["AI/ML"], "branch": "CSE", "experienceLevel": "intermediate", "onboardingCompleted": True}
    body.update(extra)
    assert client.put("/api/profile", headers=u.h, json=body).status_code == 200


def test_alert_crud_validation_and_idor(client, student, student2):
    r = client.post("/api/alerts", headers=student.h, json={"name": "ML internships", "category": "Internship", "domain": "AI/ML", "skill": "python", "workMode": "remote", "minFit": 50, "deadlineWithinDays": 60})
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["domain"] == "AI/ML" and a["skill"] == "python" and a["hitCount"] == 0 and a["enabled"] is True
    for bad in ({"name": ""}, {"name": "x", "minFit": 101}, {"name": "x", "workMode": "moon"}, {"name": "x", "deadlineWithinDays": 0}, {"name": "x", "studentId": "z"}):
        assert client.post("/api/alerts", headers=student.h, json=bad).status_code == 422
    assert client.post("/api/alerts", headers=student.h, json={"name": "x", "skill": "not-a-skill"}).status_code == 400
    p = client.patch(f"/api/alerts/{a['id']}", headers=student.h, json={"enabled": False, "minFit": 70}).json()
    assert p["enabled"] is False and p["minFit"] == 70
    assert client.patch(f"/api/alerts/{a['id']}", headers=student2.h, json={"enabled": True}).status_code == 404
    assert client.post(f"/api/alerts/{a['id']}/evaluate", headers=student2.h).status_code == 404
    assert client.get(f"/api/alerts/{a['id']}/hits", headers=student2.h).status_code == 404
    assert client.delete(f"/api/alerts/{a['id']}", headers=student2.h).status_code == 404
    assert client.get("/api/alerts", headers=student2.h).json() == []
    assert client.delete(f"/api/alerts/{a['id']}", headers=student.h).status_code == 204


def test_manual_evaluation_creates_hits_and_notifications_once(client, student, catalog):
    profile(client, student)
    a = client.post("/api/alerts", headers=student.h, json={"name": "AI hackathons", "category": "Hackathon", "domain": "AI/ML", "minFit": 40}).json()
    first = client.post(f"/api/alerts/{a['id']}/evaluate", headers=student.h).json()
    assert first["matches"] and first["notificationsCreated"] == len(first["matches"])
    assert all(m["fit"] >= 40 for m in first["matches"])
    n = client.get("/api/notifications", headers=student.h).json()
    assert n["total"] == len(first["matches"]) and n["items"][0]["kind"] == "smart_alert" and "fit" in n["items"][0]["body"]
    again = client.post(f"/api/alerts/{a['id']}/evaluate", headers=student.h).json()
    assert again["matches"] == [] and again["notificationsCreated"] == 0                         # idempotent
    hits = client.get(f"/api/alerts/{a['id']}/hits", headers=student.h).json()["items"]
    assert len(hits) == len(first["matches"]) and client.get("/api/alerts", headers=student.h).json()[0]["hitCount"] == len(hits)


def test_min_fit_filters_and_muted_alerts_still_record_hits_without_notifying(client, student, catalog):
    profile(client, student)
    strict = client.post("/api/alerts", headers=student.h, json={"name": "Impossible", "category": "Hackathon", "minFit": 100}).json()
    assert client.post(f"/api/alerts/{strict['id']}/evaluate", headers=student.h).json()["matches"] == []
    client.put("/api/notifications/preferences", headers=student.h, json={"smartAlert": False})
    quiet = client.post("/api/alerts", headers=student.h, json={"name": "Quiet", "category": "Internship", "minFit": 0}).json()
    res = client.post(f"/api/alerts/{quiet['id']}/evaluate", headers=student.h).json()
    assert res["matches"] and res["notificationsCreated"] == 0
    assert client.get("/api/notifications", headers=student.h).json()["total"] == 0


def test_new_opportunity_flows_through_alert_evaluator_to_notification(client, make_user, catalog, svc):
    from app.jobs.runner import run_job
    u = make_user("student", "Pipeline Person")
    profile(client, u)
    a = client.post("/api/alerts", headers=u.h, json={"name": "Robotics", "query": "alerttest robotics", "minFit": 0}).json()
    run_job("alerts")                                            # baseline: nothing matches yet
    assert client.get("/api/notifications", headers=u.h).json()["total"] == 0
    with open_db("service_role") as db:
        stats = run_source(db, OneShot("atest-new", [{"externalId": "n1", "title": "AlertTest Robotics Cup", "organization": "AlertTest Org", "requiredSkills": ["python"],
                                                       "domain": "AI/ML", "difficulty": "intermediate", "deadline": (dt.date.today() + dt.timedelta(days=20)).isoformat(), "category": "Competition"}]))
    assert stats.inserted == 1
    res = run_job("alerts")
    assert res["matches"] >= 1
    notes = client.get("/api/notifications", headers=u.h).json()["items"]
    assert any(n["kind"] == "smart_alert" and "AlertTest Robotics Cup" in n["body"] for n in notes)
    assert run_job("alerts")["notifications"] == 0             # incremental + idempotent: nothing new the second time


def test_high_fit_notifications_for_new_opportunities_respect_threshold_and_prefs(client, make_user, catalog):
    from app.services.alerts import notify_high_fit
    keen = make_user("student", "Keen Student", experience_level="intermediate")
    profile(client, keen, skills=["python", "machine learning", "nlp"], interests=["AI/ML"])
    muted = make_user("student", "Muted Student")
    profile(client, muted, skills=["python", "machine learning", "nlp"], interests=["AI/ML"])
    client.put("/api/notifications/preferences", headers=muted.h, json={"highFit": False})
    with open_db("service_role") as db:
        run_source(db, OneShot("atest-hf", [{"externalId": "h1", "title": "AlertTest NLP Challenge", "organization": "AlertTest Labs", "requiredSkills": ["python", "machine learning"],
                                             "preferredSkills": ["nlp"], "domain": "AI/ML", "difficulty": "intermediate", "format": "online", "participation": "team",
                                             "deadline": (dt.date.today() + dt.timedelta(days=45)).isoformat(), "category": "Competition"}]))
        new_ids = [r["id"] for r in db.all("select id::text as id from public.opportunities where title = 'AlertTest NLP Challenge'")]
        out = notify_high_fit(db, new_ids)
    assert out["notifications"] >= 1
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=keen.h).json()["items"]]
    assert "high_fit_opportunity" in kinds
    assert client.get("/api/notifications", headers=muted.h).json()["total"] == 0


def test_cron_endpoint_requires_the_secret(client):
    assert client.post("/api/internal/jobs/sql").status_code == 403
    assert client.post("/api/internal/jobs/sql", headers={"X-Cron-Secret": "wrong"}).status_code == 403
    ok = client.post("/api/internal/jobs/sql", headers={"X-Cron-Secret": "test-cron-secret"})
    assert ok.status_code == 200 and ok.json()["job"] == "sql" and "deadlineReminders" in ok.json()
    assert client.post("/api/internal/jobs/nope", headers={"X-Cron-Secret": "test-cron-secret"}).status_code == 404


def test_advisory_lock_prevents_overlapping_runs(_database):
    from app.jobs.runner import _lock_key, run_job
    from app.db.session import open_db as od
    with od("service_role") as holder:
        assert holder.val("select pg_try_advisory_xact_lock(:k)", k=_lock_key("sql")) is True
        assert run_job("sql") == {"skipped": True, "reason": "already running"}
    assert run_job("sql").get("job") == "sql"
