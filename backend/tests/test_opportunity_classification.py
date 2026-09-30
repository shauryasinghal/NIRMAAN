def test_categories_are_derived_and_nonempty(client):
    r = client.get("/api/opportunities/categories")
    assert r.status_code == 200
    items = r.json()["items"]
    assert "Hackathon" in items


def test_category_filter_returns_only_matching_category(client):
    r = client.get("/api/opportunities?category=Hackathon&limit=50")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0
    assert all(i["category"] == "Hackathon" for i in items)


def test_team_category_has_real_team_size_not_fabricated_headcount(client):
    r = client.get("/api/opportunities?category=Hackathon&limit=5")
    items = r.json()["items"]
    for i in items:
        assert i["participation"] == "team"
        assert i["minTeamSize"] is not None
        assert i["maxTeamSize"] is not None


def test_source_type_is_classified(client):
    r = client.get("/api/opportunities?limit=50")
    items = r.json()["items"]
    assert all(i["sourceType"] in ("official", "aggregator") for i in items)


def test_recommend_includes_trust_and_category_fields(client, student_auth):
    _, headers = student_auth
    r = client.get("/api/opportunities/recommend?topK=5", headers=headers)
    item = r.json()["items"][0]
    assert "category" in item and "sourceType" in item and "updatedAt" in item
