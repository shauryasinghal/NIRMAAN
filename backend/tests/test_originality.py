def test_near_duplicate_idea_flagged_for_review(client, student_auth):
    _, headers = student_auth
    r = client.post("/api/idea/check", headers=headers, json={
        "title": "Hackathon teammate matcher",
        "description": "A platform for finding teammates with matching or complementary technical skills for hackathons.",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "needs_review"
    assert body["matches"][0]["similarity"] > 50
    assert body["noveltyScore"] < 50


def test_genuinely_novel_idea_is_not_flagged(client, student_auth):
    _, headers = student_auth
    r = client.post("/api/idea/check", headers=headers, json={
        "title": "Zero-gravity plant growth telemetry dashboard",
        "description": "A dashboard visualising soil moisture and light telemetry for plants grown aboard the ISS.",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("novel", "worth_reviewing")


def test_idea_check_appears_in_history(client, student_auth):
    _, headers = student_auth
    client.post("/api/idea/check", headers=headers, json={"title": "Test idea", "description": "A short description of a test idea."})
    r = client.get("/api/idea/history", headers=headers)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


def test_reviewer_can_decide_and_student_status_updates(client, student_auth, reviewer_auth):
    _, headers = student_auth
    check = client.post("/api/idea/check", headers=headers, json={
        "title": "Hackathon teammate matcher clone",
        "description": "A platform for finding teammates with matching or complementary technical skills for hackathons.",
    }).json()
    assert check["status"] == "needs_review"

    queue = client.get("/api/reviewer/queue", headers=reviewer_auth).json()["items"]
    review = next(i for i in queue if i["ideaId"] == check["ideaId"])

    r = client.post(f"/api/reviewer/{review['reviewId']}/decision", headers=reviewer_auth, json={"decision": "dismiss"})
    assert r.status_code == 200

    history = client.get("/api/idea/history", headers=headers).json()["items"]
    updated = next(i for i in history if i["id"] == check["ideaId"])
    assert updated["status"] == "novel"


def test_non_reviewer_cannot_access_review_queue(client, student_auth):
    _, headers = student_auth
    r = client.get("/api/reviewer/queue", headers=headers)
    assert r.status_code == 403
