def test_team_suggestion_covers_target_skills(client, student_auth):
    _, headers = student_auth
    r = client.post("/api/team/suggest", headers=headers, json={
        "target_skills": ["react", "python", "machine learning"], "team_size": 3,
    })
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["coverageScore"] <= 1
    assert 0 <= len(body["members"]) <= 3
    assert "reason" in body


def test_team_suggestion_requires_auth(client):
    r = client.post("/api/team/suggest", json={"target_skills": ["python"], "team_size": 2})
    assert r.status_code == 401


def test_empty_target_skills_returns_gracefully(client, student_auth):
    _, headers = student_auth
    r = client.post("/api/team/suggest", headers=headers, json={"target_skills": [], "team_size": 3})
    assert r.status_code == 200
    assert r.json()["coverageScore"] == 0.0
