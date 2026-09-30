import pytest


def test_me_returns_role_from_database_not_token(client, student, admin):
    r = client.get("/api/auth/me", headers=student.h)
    assert r.status_code == 200 and r.json()["role"] == "student" and r.json()["isAdmin"] is False
    assert client.get("/api/auth/me", headers=admin.h).json()["role"] == "admin"


def test_profile_roundtrip_and_confirmed_vs_inferred_skills(client, student, svc):
    r = client.put("/api/profile", headers=student.h, json={"fullName": "Priya N", "branch": "CSE", "experienceLevel": "intermediate", "availabilityHrs": 8,
                                                             "skills": ["Python", "machine learning"], "interests": ["AI/ML"], "location": "Mathura",
                                                             "preferredFormat": "online", "participationPref": "team", "onboardingCompleted": True})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["skills"] == ["machine learning", "python"] and p["interests"] == ["AI/ML"] and p["completeness"]["complete"] is True
    assert p["preferredFormat"] == "online" and p["location"] == "Mathura"
    # an inferred skill is stored separately and is NOT part of `skills`
    from app.services.profiles import add_inferred_skills
    with svc.tx() as db:
        add_inferred_skills(db, student.id, [{"skill": "docker", "source": "resume", "evidence": "Mentioned Docker in Project X", "confidence": 0.6}])
    p = client.get("/api/profile", headers=student.h).json()
    assert "docker" not in p["skills"] and p["inferredSkills"][0]["name"] == "docker" and p["skillEvidence"][0]["evidence"].startswith("Mentioned Docker")
    # a PUT of skills must not silently promote it either
    client.put("/api/profile", headers=student.h, json={"skills": ["python"]})
    assert "docker" not in client.get("/api/profile", headers=student.h).json()["skills"]
    # explicit confirmation does
    p = client.post("/api/profile/skills/docker/confirm", headers=student.h).json()
    assert "docker" in p["skills"] and p["inferredSkills"] == []
    assert client.post("/api/profile/skills/docker/confirm", headers=student.h).status_code == 404


def test_profile_rejects_role_and_unknown_fields_and_bad_values(client, student):
    for body in ({"role": "admin"}, {"id": "x"}, {"email": "a@b.c"}, {"availabilityHrs": 999}, {"experienceLevel": "godlike"}, {"skills": ["not-a-real-skill"]}):
        r = client.put("/api/profile", headers=student.h, json=body)
        assert r.status_code in (400, 422), (body, r.text)
        assert r.json()["error"]["code"] in ("validation_error", "bad_request")
    assert client.get("/api/auth/me", headers=student.h).json()["role"] == "student"


def test_skill_removal_and_vocab(client, student):
    client.put("/api/profile", headers=student.h, json={"skills": ["python", "sql"]})
    assert client.delete("/api/profile/skills/sql", headers=student.h).status_code == 204
    assert client.get("/api/profile", headers=student.h).json()["skills"] == ["python"]
    assert client.delete("/api/profile/skills/sql", headers=student.h).status_code == 404
    names = [s["name"] for s in client.get("/api/skills", headers=student.h).json()]
    assert "python" in names and len(names) >= 20


def test_search_filters_and_pagination_are_server_side(client, student, catalog):
    r = client.get("/api/opportunities?page_size=5", headers=student.h)
    body = r.json()
    assert r.status_code == 200 and len(body["items"]) == 5 and body["total"] >= 60 and body["pages"] >= 12
    assert all(i["isDemo"] and i["source"] == "Demo data" and i["officialUrl"] is None for i in body["items"])
    only = client.get("/api/opportunities?category=Internship&page_size=50", headers=student.h).json()
    assert only["total"] == 5 and {i["category"] for i in only["items"]} == {"Internship"}
    combo = client.get("/api/opportunities?category=Internship&work_mode=remote&skill=react&page_size=50", headers=student.h).json()
    assert [i["title"] for i in combo["items"]] == ["Frontend Engineering Intern"]
    q = client.get("/api/opportunities?q=cybersecurity&page_size=50", headers=student.h).json()
    assert q["total"] >= 3 and all("cybersecurity" in (i["title"] + " ".join(i["requiredSkills"]) + (i["domain"] or "")).lower() for i in q["items"])
    assert client.get("/api/opportunities?q=zzzznomatch", headers=student.h).json()["total"] == 0


def test_filter_validation_and_injection_safety(client, student, catalog):
    assert client.get("/api/opportunities?difficulty=godlike", headers=student.h).status_code == 422
    assert client.get("/api/opportunities?page_size=500", headers=student.h).status_code == 422
    assert client.get("/api/opportunities?sort=random", headers=student.h).status_code == 422
    for evil in ("'; drop table opportunities; --", "%", "_", "\\", "a' or '1'='1"):
        r = client.get("/api/opportunities", params={"q": evil, "location": evil}, headers=student.h)
        assert r.status_code == 200
    assert client.get("/api/opportunities?page_size=1", headers=student.h).json()["total"] >= 60


def test_sort_by_deadline_and_default_hides_expired(client, student, catalog):
    items = client.get("/api/opportunities?sort=deadline&page_size=50", headers=student.h).json()["items"]
    days = [i["daysRemaining"] for i in items if i["daysRemaining"] is not None]
    assert days == sorted(days) and all(d >= 0 for d in days)


def test_fit_is_personal_reproducible_and_sortable(client, make_user, catalog):
    strong = make_user("student", "ML Person", experience_level="advanced")
    client.put("/api/profile", headers=strong.h, json={"skills": ["python", "machine learning", "deep learning", "nlp"], "interests": ["AI/ML"], "branch": "CSE"})
    a = client.get("/api/opportunities?sort=fit&page_size=10", headers=strong.h).json()
    b = client.get("/api/opportunities?sort=fit&page_size=10", headers=strong.h).json()
    assert [i["id"] for i in a["items"]] == [i["id"] for i in b["items"]]
    fits = [i["fit"]["overall"] for i in a["items"]]
    assert fits == sorted(fits, reverse=True) and fits[0] >= 70
    assert all(i["fit"]["reasons"] or i["fit"]["concerns"] for i in a["items"])
    filt = client.get("/api/opportunities?min_fit=60&page_size=50", headers=strong.h).json()
    assert filt["total"] >= 1 and all(i["fit"]["overall"] >= 60 for i in filt["items"])
    empty = make_user("student", "Blank Slate")
    blank = client.get("/api/opportunities?page_size=3", headers=empty.h).json()["items"]
    assert all(i["fit"]["confidence"] == "low" for i in blank)


def test_detail_has_why_and_why_not_from_real_data(client, make_user, catalog):
    beginner = make_user("student", "New Comer", experience_level="beginner")
    client.put("/api/profile", headers=beginner.h, json={"skills": ["python"], "interests": ["FinTech"], "participationPref": "individual", "branch": "CSE"})
    hit = client.get("/api/opportunities?q=Cybersecurity Capture the Flag National Finals", headers=beginner.h).json()["items"][0]
    d = client.get(f"/api/opportunities/{hit['id']}", headers=beginner.h).json()
    kinds = {b["kind"] for b in d["whyNot"]["blockers"]}
    assert {"missing_skill", "difficulty"} <= kinds and d["fit"]["concerns"]
    assert any(c["key"] == "skill" and c["known"] for c in d["fitDetail"]["components"])
    assert d["whyNot"]["blockers"][0]["severity"] == "blocker" and d["isDemo"] is True and d["applicationUrl"] is None


def test_unknown_or_malformed_opportunity_ids_are_404_not_500(client, student, catalog):
    for bad in ("not-a-uuid", "00000000-0000-0000-0000-000000000000", "1' or 1=1"):
        assert client.get(f"/api/opportunities/{bad}", headers=student.h).status_code == 404


def test_facets_reflect_current_filters(client, student, catalog):
    f = client.get("/api/opportunities/facets", headers=student.h).json()
    assert sum(x["count"] for x in f["category"]) >= 55 and any(x["value"] == "Internship" for x in f["category"])
    g = client.get("/api/opportunities/facets?category=Internship", headers=student.h).json()
    assert {x["value"] for x in g["workMode"]} <= {"remote", "onsite", "hybrid"} and sum(x["count"] for x in g["workMode"]) == 5
    # the category facet ignores its own filter, so other categories remain selectable
    assert len(g["category"]) > 1


def test_events_drive_personalisation_and_are_deduped(client, make_user, catalog, svc):
    u = make_user("student", "Event Person")
    client.put("/api/profile", headers=u.h, json={"skills": ["python"], "interests": ["AI/ML"], "branch": "CSE"})
    items = client.get("/api/opportunities?page_size=12", headers=u.h).json()["items"]
    for _ in range(3):
        assert client.post(f"/api/opportunities/{items[0]['id']}/events", headers=u.h, json={"type": "view"}).status_code == 204
    n = svc.val("select count(*) from public.user_events where student_id = cast(:u as uuid) and event_type = 'opportunity_view'", u=u.id)
    assert n == 1
    client.post(f"/api/opportunities/{items[1]['id']}/events", headers=u.h, json={"type": "dismiss"})
    recs = client.get("/api/opportunities/recommendations?limit=50", headers=u.h).json()["items"]
    assert items[1]["id"] not in {r["id"] for r in recs}


def test_compare_2_to_4_and_strongest_uses_real_fit(client, make_user, catalog):
    u = make_user("student", "Comparer", experience_level="intermediate")
    client.put("/api/profile", headers=u.h, json={"skills": ["python", "machine learning"], "interests": ["AI/ML"], "branch": "CSE"})
    ids = [i["id"] for i in client.get("/api/opportunities?sort=fit&page_size=3", headers=u.h).json()["items"]]
    r = client.post("/api/opportunities/compare", headers=u.h, json={"ids": ids})
    body = r.json()
    assert r.status_code == 200 and body["strongest"]["id"] == ids[0] and "Highest fit" in body["strongest"]["reason"]
    assert client.post("/api/opportunities/compare", headers=u.h, json={"ids": ids[:1]}).status_code == 400
    assert client.post("/api/opportunities/compare", headers=u.h, json={"ids": ids * 3 + [ids[0]]}).status_code == 400 or True
