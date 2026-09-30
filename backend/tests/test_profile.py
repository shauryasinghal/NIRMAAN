def test_profile_starts_incomplete(client, student_auth):
    _, headers = student_auth
    r = client.get("/api/profile", headers=headers)
    assert r.status_code == 200
    assert r.json()["profile_complete"] is False


def test_profile_update_persists_and_marks_complete(client, student_auth):
    _, headers = student_auth
    r = client.put("/api/profile", headers=headers, json={
        "branch": "CSE (AI/ML)", "year": "3",
        "skills": ["python", "react"], "interests": ["ai/ml"],
        "experience_level": "intermediate", "availability_hrs": 10,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["profile_complete"] is True
    assert body["skills"] == ["python", "react"]

    # persisted across a fresh GET
    r2 = client.get("/api/profile", headers=headers)
    assert r2.json()["skills"] == ["python", "react"]
