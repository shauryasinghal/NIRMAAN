import io


def _login_new_student(client, suffix):
    email = f"phase8-{suffix}@gla.demo"
    client.post("/api/auth/register", json={"name": f"P8 {suffix}", "email": email, "password": "pass1234"})
    r = client.post("/api/auth/login", json={"email": email, "password": "pass1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_google_status_is_unconfigured_in_this_environment(client):
    r = client.get("/api/auth/google/status")
    assert r.status_code == 200
    assert r.json()["configured"] is False


def test_google_login_returns_503_when_not_configured(client):
    r = client.get("/api/auth/google/login")
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "GOOGLE_NOT_CONFIGURED"


def test_calendar_status_reports_unconfigured_and_unconnected(client):
    headers = _login_new_student(client, "cal1")
    r = client.get("/api/integrations/google/calendar/status", headers=headers)
    assert r.status_code == 200
    assert r.json() == {"configured": False, "connected": False}


def test_calendar_connect_returns_503_when_not_configured(client):
    headers = _login_new_student(client, "cal2")
    r = client.get("/api/integrations/google/calendar/connect", headers=headers)
    assert r.status_code == 503


def test_ics_download_works_without_any_google_configuration(client):
    headers = _login_new_student(client, "ics1")
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]
    r = client.get(f"/api/opportunities/{opp_id}/calendar.ics", headers=headers)
    assert r.status_code == 200
    assert "BEGIN:VCALENDAR" in r.text
    assert "BEGIN:VEVENT" in r.text


def test_calendar_event_creation_fails_cleanly_without_connection(client):
    headers = _login_new_student(client, "ics2")
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]
    r = client.post(f"/api/opportunities/{opp_id}/calendar-event", headers=headers)
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "CALENDAR_NOT_CONNECTED"


def test_idea_history_detail_and_delete_ownership_scoped(client):
    a = _login_new_student(client, "ideaA")
    b = _login_new_student(client, "ideaB")
    check = client.post("/api/idea/check", headers=a, json={
        "title": "Some idea", "description": "A description long enough to embed meaningfully.",
    }).json()
    idea_id = check["ideaId"]

    detail = client.get(f"/api/idea/history/{idea_id}", headers=a)
    assert detail.status_code == 200
    assert detail.json()["id"] == idea_id

    other_detail = client.get(f"/api/idea/history/{idea_id}", headers=b)
    assert other_detail.status_code == 404
    other_delete = client.delete(f"/api/idea/history/{idea_id}", headers=b)
    assert other_delete.status_code == 404

    delr = client.delete(f"/api/idea/history/{idea_id}", headers=a)
    assert delr.status_code == 200
    history = client.get("/api/idea/history", headers=a).json()["items"]
    assert idea_id not in [h["id"] for h in history]


def test_resume_upload_rejects_disallowed_file_type(client):
    headers = _login_new_student(client, "resume1")
    r = client.post(
        "/api/profile/resume/upload", headers=headers,
        files={"file": ("resume.txt", b"just text", "text/plain")},
    )
    assert r.status_code == 422


def test_resume_upload_and_confirm_updates_profile_for_real(client):
    from reportlab.pdfgen import canvas
    headers = _login_new_student(client, "resume2")

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, "Test Student")
    c.drawString(100, 730, "Skills: Python, React")
    c.save()

    r = client.post(
        "/api/profile/resume/upload", headers=headers,
        files={"file": ("resume.pdf", buf.getvalue(), "application/pdf")},
    )
    assert r.status_code == 200
    new_skills = r.json()["extracted"]["newSkills"]
    assert "python" in new_skills

    confirm = client.post("/api/profile/resume/confirm", headers=headers, json={"skillsToAdd": new_skills})
    assert confirm.status_code == 200
    assert "python" in confirm.json()["skills"]

    profile = client.get("/api/profile", headers=headers).json()
    assert "python" in profile["skills"]


def test_resume_confirm_never_removes_existing_skills(client):
    headers = _login_new_student(client, "resume3")
    client.put("/api/profile", headers=headers, json={"skills": ["sql"], "interests": []})
    client.post("/api/profile/resume/confirm", headers=headers, json={"skillsToAdd": ["python"]})
    profile = client.get("/api/profile", headers=headers).json()
    assert "sql" in profile["skills"]
    assert "python" in profile["skills"]
