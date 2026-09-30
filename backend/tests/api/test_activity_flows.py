import datetime as dt

import pytest


def first_opp(client, u, **q):
    return client.get("/api/opportunities", params={"page_size": 5, **q}, headers=u.h).json()["items"][0]


def test_save_unsave_idempotent_records_signals(client, student, catalog, svc):
    o = first_opp(client, student)
    assert client.put(f"/api/saved/{o['id']}", headers=student.h).status_code == 204
    assert client.put(f"/api/saved/{o['id']}", headers=student.h).status_code == 204          # idempotent
    saved = client.get("/api/saved", headers=student.h).json()
    assert saved["total"] == 1 and saved["items"][0]["saved"] is True and saved["items"][0]["fit"] is not None
    assert client.get(f"/api/opportunities/{o['id']}", headers=student.h).json()["saved"] is True
    assert svc.val("select count(*) from public.user_events where student_id = cast(:u as uuid) and event_type = 'save'", u=student.id) == 1
    assert svc.val("select count(*) from public.recommendation_events where student_id = cast(:u as uuid)", u=student.id) == 1
    assert svc.val("select count(*) from public.activities where student_id = cast(:u as uuid) and kind = 'opportunity_saved'", u=student.id) == 1
    assert client.delete(f"/api/saved/{o['id']}", headers=student.h).status_code == 204
    assert client.get("/api/saved", headers=student.h).json()["total"] == 0
    assert client.put("/api/saved/00000000-0000-0000-0000-000000000000", headers=student.h).status_code == 404


def test_application_lifecycle_timeline_is_real(client, student, catalog, svc):
    o = first_opp(client, student)
    r = client.post("/api/applications", headers=student.h, json={"opportunityId": o["id"]})
    assert r.status_code == 201 and r.json()["status"] == "wishlist" and r.json()["timeline"][0]["kind"] == "created"
    aid = r.json()["id"]
    assert client.post("/api/applications", headers=student.h, json={"opportunityId": o["id"]}).status_code == 409
    for status in ("planning", "applied"):
        assert client.patch(f"/api/applications/{aid}", headers=student.h, json={"status": status}).status_code == 200
    client.patch(f"/api/applications/{aid}", headers=student.h, json={"notes": "Draft ready", "nextAction": "Submit form", "reminderAt": (dt.date.today() + dt.timedelta(days=2)).isoformat()})
    a = client.get(f"/api/applications/{aid}", headers=student.h).json()
    assert a["status"] == "applied" and a["nextAction"] == "Submit form"
    kinds = [e["kind"] for e in a["timeline"]]
    assert kinds == ["created", "status_changed", "status_changed", "note_added", "next_action_set", "reminder_set"]
    assert a["timeline"][1]["detail"] == "wishlist -> planning" and a["timeline"][2]["detail"] == "planning -> applied"
    lst = client.get("/api/applications", headers=student.h).json()
    assert lst["total"] == 1 and lst["counts"]["applied"] == 1 and lst["counts"]["wishlist"] == 0
    assert svc.val("select count(*) from public.user_events where student_id = cast(:u as uuid) and event_type in ('application_start','application_submit')", u=student.id) == 2
    assert svc.val("select count(*) from public.recommendation_events where student_id = cast(:u as uuid) and event_type = 'applied'", u=student.id) == 1
    assert client.get(f"/api/opportunities/{o['id']}", headers=student.h).json()["applicationStatus"] == "applied"


def test_application_validation(client, student, catalog):
    o = first_opp(client, student)
    aid = client.post("/api/applications", headers=student.h, json={"opportunityId": o["id"]}).json()["id"]
    for body in ({"status": "flying"}, {"studentId": "x"}, {"notes": "x" * 6000}, {"reminderAt": "not-a-date"}):
        assert client.patch(f"/api/applications/{aid}", headers=student.h, json=body).status_code == 422
    assert client.post("/api/applications", headers=student.h, json={"opportunityId": "nope"}).status_code == 404
    assert client.post("/api/applications", headers=student.h, json={"opportunityId": o["id"], "studentId": "x"}).status_code == 422


def test_idor_user_b_cannot_touch_user_a_records(client, student, student2, catalog):
    o = first_opp(client, student)
    aid = client.post("/api/applications", headers=student.h, json={"opportunityId": o["id"]}).json()["id"]
    client.put(f"/api/saved/{o['id']}", headers=student.h)
    assert client.get(f"/api/applications/{aid}", headers=student2.h).status_code == 404
    assert client.patch(f"/api/applications/{aid}", headers=student2.h, json={"status": "selected"}).status_code == 404
    assert client.delete(f"/api/applications/{aid}", headers=student2.h).status_code == 404
    assert client.get("/api/applications", headers=student2.h).json()["total"] == 0
    assert client.get("/api/saved", headers=student2.h).json()["total"] == 0
    assert client.get(f"/api/applications/{aid}", headers=student.h).json()["status"] == "wishlist"      # untouched


def test_notifications_read_state_preferences_and_idor(client, student, student2, svc):
    from app.services.notifications import notify
    with svc.tx() as db:
        assert notify(db, student.id, "smart_alert", "Alert matched", "body", "/opportunities", "k1") is True
        assert notify(db, student.id, "smart_alert", "Alert matched", "body", "/opportunities", "k1") is False      # deduped
        notify(db, student.id, "deadline_approaching", "Deadline", "", None, "k2")
    n = client.get("/api/notifications", headers=student.h).json()
    assert n["total"] == 2 and n["unread"] == 2 and client.get("/api/notifications/unread-count", headers=student.h).json()["unread"] == 2
    nid = n["items"][0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=student2.h).status_code == 404       # not theirs
    assert client.get("/api/notifications", headers=student2.h).json()["total"] == 0
    assert client.post(f"/api/notifications/{nid}/read", headers=student.h).status_code == 200
    assert client.get("/api/notifications?unread=true", headers=student.h).json()["total"] == 1
    assert client.post("/api/notifications/read-all", headers=student.h).status_code == 200
    assert client.get("/api/notifications/unread-count", headers=student.h).json()["unread"] == 0
    # preferences are honoured at creation time
    p = client.put("/api/notifications/preferences", headers=student.h, json={"smartAlert": False, "minFitForNotify": 60}).json()
    assert p["smartAlert"] is False and p["deadline"] is True and p["minFitForNotify"] == 60
    with svc.tx() as db:
        assert notify(db, student.id, "smart_alert", "Muted", "", None, "k3") is False
        assert notify(db, student.id, "deadline_approaching", "Still on", "", None, "k4") is True
    assert client.put("/api/notifications/preferences", headers=student.h, json={"minFitForNotify": 500}).status_code == 422


def test_students_cannot_write_notifications_directly_at_db_level(client, student):
    """The API exposes no create endpoint, and RLS/grants deny direct inserts (see also supabase/tests)."""
    assert client.post("/api/notifications", headers=student.h, json={"title": "x"}).status_code in (404, 405)


def test_sql_deadline_job_respects_preferences_and_is_idempotent(client, make_user, catalog, svc):
    u = make_user("student", "Deadline Person")
    quiet = make_user("student", "Quiet Person")
    o = svc.one("select id::text i from public.opportunities where source_type = 'dev_seed' limit 1")
    svc.run("update public.opportunities set deadline = current_date + 2 where id = cast(:i as uuid)", i=o["i"])
    for x in (u, quiet):
        client.put(f"/api/saved/{o['i']}", headers=x.h)
    client.put("/api/notifications/preferences", headers=quiet.h, json={"deadline": False})
    first = svc.val("select private.generate_deadline_reminders()")
    second = svc.val("select private.generate_deadline_reminders()")
    assert first >= 1 and second == 0
    assert client.get("/api/notifications", headers=u.h).json()["items"][0]["kind"] == "deadline_approaching"
    assert client.get("/api/notifications", headers=quiet.h).json()["total"] == 0


def test_activity_feed_and_transparent_signals(client, student, catalog):
    o = first_opp(client, student)
    client.put(f"/api/saved/{o['id']}", headers=student.h)
    client.post("/api/applications", headers=student.h, json={"opportunityId": o["id"]})
    feed = client.get("/api/activity", headers=student.h).json()
    assert feed["total"] >= 2 and feed["items"][0]["createdAt"] >= feed["items"][-1]["createdAt"]
    sig = client.get("/api/activity/signals", headers=student.h).json()
    assert all(set(e) == {"eventType", "n"} for e in sig["eventCounts"]) and sig["eventCounts"]        # camelCase contract (the UI reads eventType)
    assert sig["totalEvents"] >= 2 and sig["active"] is False and sig["minEvents"] == 5 and "13%" in sig["explanation"]
    assert client.delete("/api/activity/signals", headers=student.h).status_code == 204
    assert client.get("/api/activity/signals", headers=student.h).json()["totalEvents"] == 0
