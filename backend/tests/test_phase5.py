def _login_new_student(client, suffix):
    email = f"phase5-{suffix}@gla.demo"
    client.post("/api/auth/register", json={"name": f"P5 {suffix}", "email": email, "password": "pass1234"})
    r = client.post("/api/auth/login", json={"email": email, "password": "pass1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_save_and_unsave_opportunity(client):
    headers = _login_new_student(client, "save1")
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]

    r = client.post(f"/api/opportunities/{opp_id}/save", headers=headers)
    assert r.status_code == 201
    assert client.get("/api/saved-opportunities", headers=headers).json()["total"] == 1

    r = client.delete(f"/api/opportunities/{opp_id}/save", headers=headers)
    assert r.status_code == 200
    assert client.get("/api/saved-opportunities", headers=headers).json()["total"] == 0


def test_saved_opportunities_are_isolated_per_student(client):
    a = _login_new_student(client, "saveA")
    b = _login_new_student(client, "saveB")
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]

    client.post(f"/api/opportunities/{opp_id}/save", headers=a)
    assert client.get("/api/saved-opportunities", headers=a).json()["total"] == 1
    assert client.get("/api/saved-opportunities", headers=b).json()["total"] == 0


def test_application_pipeline_and_activity_log(client):
    headers = _login_new_student(client, "app1")
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]

    r = client.post("/api/applications", headers=headers, json={"opportunity_id": opp_id, "status": "wishlist"})
    assert r.status_code == 201
    app_id = r.json()["id"]

    r = client.patch(f"/api/applications/{app_id}", headers=headers, json={"status": "applying"})
    assert r.status_code == 200
    assert r.json()["status"] == "applying"

    events = client.get(f"/api/applications/{app_id}/activity", headers=headers).json()["items"]
    kinds = [e["kind"] for e in events]
    assert "created" in kinds
    assert "status_changed" in kinds


def test_application_rejects_invalid_status(client):
    headers = _login_new_student(client, "app2")
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]
    r = client.post("/api/applications", headers=headers, json={"opportunity_id": opp_id, "status": "not-a-real-status"})
    assert r.status_code == 400


def test_student_cannot_access_another_students_application(client):
    a = _login_new_student(client, "appA")
    b = _login_new_student(client, "appB")
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]

    app_id = client.post("/api/applications", headers=a, json={"opportunity_id": opp_id}).json()["id"]

    r = client.patch(f"/api/applications/{app_id}", headers=b, json={"status": "applied"})
    assert r.status_code == 404
    r = client.get(f"/api/applications/{app_id}/activity", headers=b)
    assert r.status_code == 404


def test_needs_review_idea_creates_a_notification(client):
    headers = _login_new_student(client, "notif1")
    client.post("/api/idea/check", headers=headers, json={
        "title": "Hackathon teammate matcher",
        "description": "A platform for finding teammates with matching or complementary technical skills for hackathons.",
    })
    notifs = client.get("/api/notifications", headers=headers).json()
    assert notifs["unreadCount"] >= 1
    assert any(n["kind"] == "originality_review" for n in notifs["items"])


def test_mark_notification_read(client):
    headers = _login_new_student(client, "notif2")
    client.post("/api/idea/check", headers=headers, json={
        "title": "Hackathon teammate matcher clone",
        "description": "A platform for finding teammates with matching or complementary technical skills for hackathons.",
    })
    notifs = client.get("/api/notifications", headers=headers).json()["items"]
    nid = notifs[0]["id"]
    r = client.patch(f"/api/notifications/{nid}/read", headers=headers)
    assert r.status_code == 200
    assert client.get("/api/notifications", headers=headers).json()["unreadCount"] == 0


def test_activity_log_records_real_actions(client):
    headers = _login_new_student(client, "activity1")
    client.put("/api/profile", headers=headers, json={"skills": ["python"], "interests": ["ai/ml"]})
    items = client.get("/api/activity", headers=headers).json()["items"]
    assert any(i["kind"] == "profile_updated" for i in items)


def test_saved_search_crud(client):
    headers = _login_new_student(client, "search1")
    r = client.post("/api/saved-searches", headers=headers, json={"name": "AI hacks", "domain": "AI/ML"})
    assert r.status_code == 201
    sid = r.json()["id"]

    r = client.patch(f"/api/saved-searches/{sid}", headers=headers, json={"name": "AI hacks", "domain": "AI/ML", "enabled": False})
    assert r.status_code == 200
    assert r.json()["enabled"] is False

    r = client.delete(f"/api/saved-searches/{sid}", headers=headers)
    assert r.status_code == 200
    assert client.get("/api/saved-searches", headers=headers).json()["items"] == []


def test_organizations_derived_from_real_opportunities(client):
    r = client.get("/api/organizations")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0
    name = items[0]["name"]
    detail = client.get(f"/api/organizations/{name}")
    assert detail.status_code == 200
    assert detail.json()["opportunityCount"] == items[0]["opportunityCount"]
