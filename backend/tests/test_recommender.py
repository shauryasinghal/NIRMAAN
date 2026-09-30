def test_recommendations_are_ranked_by_fit(client, student_auth):
    _, headers = student_auth
    client.put("/api/profile", headers=headers, json={
        "skills": ["python", "machine learning", "nlp"], "interests": ["ai/ml"],
        "experience_level": "intermediate", "availability_hrs": 8,
    })
    r = client.get("/api/opportunities/recommend?topK=10", headers=headers)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0
    # results must be sorted descending by fitScore
    scores = [i["fitScore"] for i in items]
    assert scores == sorted(scores, reverse=True)
    # a student with no cloud/devops skills should not have a 100% match on everything
    assert any(i["missingSkills"] for i in items)


def test_recommendations_include_explanation_and_urgency(client, student_auth):
    _, headers = student_auth
    client.put("/api/profile", headers=headers, json={"skills": ["python"], "interests": ["ai/ml"]})
    r = client.get("/api/opportunities/recommend?topK=5", headers=headers)
    item = r.json()["items"][0]
    assert "reason" in item and len(item["reason"]) > 0
    assert "urgency" in item


def test_opportunity_list_is_paginated(client):
    r = client.get("/api/opportunities?limit=5&offset=0")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) <= 5
    assert body["total"] >= 50  # seeded dataset has 50+ opportunities
