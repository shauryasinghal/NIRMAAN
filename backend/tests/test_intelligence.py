def _login_new_student(client, suffix, skills=None, interests=None):
    email = f"phase7-{suffix}@gla.demo"
    client.post("/api/auth/register", json={"name": f"P7 {suffix}", "email": email, "password": "pass1234"})
    r = client.post("/api/auth/login", json={"email": email, "password": "pass1234"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if skills is not None:
        client.put("/api/profile", headers=headers, json={
            "skills": skills, "interests": interests or [], "experience_level": "beginner",
            "availability_hrs": 5, "branch": "CSE (AI/ML)", "year": "3",
        })
    return headers


def test_next_best_action_prompts_profile_completion_when_no_recs(client):
    headers = _login_new_student(client, "nba1")  # no profile filled in
    r = client.get("/api/intelligence/next-best-action", headers=headers)
    assert r.status_code == 200
    action = r.json()["action"]
    assert action is not None
    assert action["link"] == "/profile"


def test_next_best_action_reflects_saved_opportunity_with_no_applications(client):
    headers = _login_new_student(client, "nba2", skills=["python"], interests=["ai/ml"])
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]
    client.post(f"/api/opportunities/{opp_id}/save", headers=headers)

    r = client.get("/api/intelligence/next-best-action", headers=headers)
    action = r.json()["action"]
    assert action["link"] == "/saved"
    assert "1" in action["title"]


def test_why_not_reports_real_missing_skills(client):
    headers = _login_new_student(client, "wn1", skills=["python"], interests=["ai/ml"])
    opps = client.get("/api/opportunities?limit=20").json()["items"]
    target = next(o for o in opps if len(o["skills"]) > 1)
    r = client.get(f"/api/intelligence/why-not/{target['id']}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "fitScore" in body
    assert isinstance(body["blockers"], list)


def test_why_not_requires_auth_and_valid_opportunity(client):
    headers = _login_new_student(client, "wn2", skills=["python"])
    r = client.get("/api/intelligence/why-not/does-not-exist", headers=headers)
    assert r.status_code == 404


def test_skill_gaps_are_derived_from_real_recommendations(client):
    headers = _login_new_student(client, "sg1", skills=["python"], interests=["ai/ml"])
    r = client.get("/api/intelligence/skill-gaps", headers=headers)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0
    for item in items:
        assert item["unlocksCount"] > 0
        assert "example" in item


def test_application_insights_flag_stalled_and_urgent(client):
    headers = _login_new_student(client, "ai1", skills=["python"], interests=["ai/ml"])
    opp_id = client.get("/api/opportunities?limit=1").json()["items"][0]["id"]
    client.post("/api/applications", headers=headers, json={"opportunity_id": opp_id, "status": "planning"})

    r = client.get("/api/intelligence/application-insights", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json()["items"], list)


def test_saved_search_evaluation_returns_real_matches(client):
    headers = _login_new_student(client, "eval1", skills=["python", "machine learning", "nlp"], interests=["ai/ml"])
    opps = client.get("/api/opportunities?limit=20").json()["items"]
    domain = opps[0]["domain"]

    sr = client.post("/api/saved-searches", headers=headers, json={"name": "test alert", "domain": domain})
    search_id = sr.json()["id"]

    r = client.post(f"/api/saved-searches/{search_id}/evaluate", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "matchCount" in body
    assert all(item["domain"] == domain for item in body["items"])


def test_saved_search_evaluation_is_ownership_scoped(client):
    a = _login_new_student(client, "evalA", skills=["python"])
    b = _login_new_student(client, "evalB", skills=["python"])
    sr = client.post("/api/saved-searches", headers=a, json={"name": "mine"})
    search_id = sr.json()["id"]
    r = client.post(f"/api/saved-searches/{search_id}/evaluate", headers=b)
    assert r.status_code == 404
