import pytest


def setup_person(client, make_user, name, skills, opted_in=True, hrs=8):
    u = make_user("student", name, open_to_team=opted_in, experience_level="intermediate", availability_hrs=hrs)
    r = client.put("/api/profile", headers=u.h, json={"skills": skills, "interests": ["AI/ML"], "branch": "CSE", "onboardingCompleted": True})
    assert r.status_code == 200, r.text
    return u


def opp_with_skills(client, u, title):
    return client.get("/api/opportunities", params={"q": title, "page_size": 5}, headers=u.h).json()["items"][0]


def test_suggest_uses_opportunity_requirements_and_only_opted_in_people(client, make_user, catalog):
    owner = setup_person(client, make_user, "Team Owner", ["python"])
    fe = setup_person(client, make_user, "Front Ender", ["react", "javascript", "css"])
    ml = setup_person(client, make_user, "Ml Person", ["machine learning", "deep learning"])
    hidden = setup_person(client, make_user, "Not Consenting", ["react", "sql", "api design", "cloud"], opted_in=False)
    opp = opp_with_skills(client, owner, "Flipkart GRiD Campus Challenge")     # java, react, sql (+ api design preferred)
    r = client.post("/api/teams/suggest", headers=owner.h, json={"opportunityId": opp["id"], "size": 4})
    assert r.status_code == 200, r.text
    t = r.json()
    ids = {m["id"] for m in t["members"]} | {c["id"] for c in t["candidates"]}
    assert hidden.id not in ids and owner.id in {m["id"] for m in t["members"]}          # consent gate; owner is member 0
    assert t["context"]["opportunity"]["title"] == "Flipkart GRiD Campus Challenge" and "react" in t["context"]["required"]
    assert t["members"][0]["isYou"] is True
    assert any(m["id"] == fe.id and "react" in m["contributedSkills"] for m in t["members"])
    picked = [m for m in t["members"] if not m.get("isYou")]
    assert all(m["why"] and m["role"] and "compatibility" in m for m in picked)
    m = t["metrics"]
    assert set(m) >= {"skillCoverage", "roleDiversity", "complementarity", "redundancy", "score", "formula", "note"} and 0 <= m["score"] <= 1
    assert "demographic" in m["note"]
    assert t["coverageBefore"]["missing"] and t["summary"]


def test_suggest_validation_and_manual_skills(client, student, catalog):
    assert client.post("/api/teams/suggest", headers=student.h, json={"size": 4}).status_code == 400            # nothing to build against
    assert client.post("/api/teams/suggest", headers=student.h, json={"requiredSkills": ["python"], "size": 1}).status_code == 422
    assert client.post("/api/teams/suggest", headers=student.h, json={"requiredSkills": ["python"], "opportunityId": "nope"}).status_code == 404
    assert client.post("/api/teams/suggest", headers=student.h, json={"requiredSkills": ["python"], "size": 3, "role": "admin"}).status_code == 422
    ok = client.post("/api/teams/suggest", headers=student.h, json={"requiredSkills": ["python", "iot"], "size": 3})
    assert ok.status_code == 200 and ok.json()["context"]["opportunity"] is None


def test_save_invite_respond_lifecycle_and_notifications(client, make_user, catalog, svc):
    owner = setup_person(client, make_user, "Lead Person", ["python"])
    mate = setup_person(client, make_user, "Mate Person", ["react", "css"])
    other = setup_person(client, make_user, "Bystander", ["sql"])
    body = {"requiredSkills": ["python", "react"], "size": 3, "memberIds": [mate.id], "name": "Dream team", "note": "Let's go"}
    r = client.post("/api/teams", headers=owner.h, json=body)
    assert r.status_code == 201, r.text
    team = r.json()
    tid = team["id"]
    assert team["isOwner"] is True and team["status"] == "forming" and team["coverage"] == 1.0
    assert {m["status"] for m in team["members"]} == {"accepted", "invited"} and team["members"][0]["role"].startswith("Team lead")
    # scores are recomputed by the server, not accepted from the client
    assert client.post("/api/teams", headers=owner.h, json={**body, "coverage": 0.0, "diversityScore": 9}).status_code == 422
    # invitee sees the team + a real notification; bystander sees nothing
    assert [t["id"] for t in client.get("/api/teams", headers=mate.h).json()["items"]] == [tid]
    assert client.get(f"/api/teams/{tid}", headers=mate.h).json()["myStatus"] == "invited"
    assert client.get(f"/api/teams/{tid}", headers=other.h).status_code == 404
    assert client.get("/api/teams", headers=other.h).json()["items"] == []
    assert any(n["kind"] == "team_event" and "invited you" in n["title"] for n in client.get("/api/notifications", headers=mate.h).json()["items"])
    # only the invitee may respond
    assert client.post(f"/api/teams/{tid}/respond", headers=other.h, json={"accept": True}).status_code == 404
    assert client.post(f"/api/teams/{tid}/respond", headers=owner.h, json={"accept": True}).status_code == 409     # owner is already accepted
    ok = client.post(f"/api/teams/{tid}/respond", headers=mate.h, json={"accept": True})
    assert ok.status_code == 200 and ok.json()["myStatus"] == "accepted"
    assert client.post(f"/api/teams/{tid}/respond", headers=mate.h, json={"accept": False}).status_code == 409     # already responded
    assert any("accepted your team invitation" in n["title"] for n in client.get("/api/notifications", headers=owner.h).json()["items"])
    assert svc.val("select count(*) from public.user_events where student_id = cast(:u as uuid) and event_type = 'team_create'", u=owner.id) == 1
    # only the owner may delete
    assert client.delete(f"/api/teams/{tid}", headers=mate.h).status_code == 404
    assert client.delete(f"/api/teams/{tid}", headers=owner.h).status_code == 204
    assert client.get(f"/api/teams/{tid}", headers=mate.h).status_code == 404


def test_cannot_invite_people_who_did_not_opt_in_or_do_not_exist(client, make_user, catalog):
    owner = setup_person(client, make_user, "Careful Owner", ["python"])
    closed = setup_person(client, make_user, "Closed Door", ["react"], opted_in=False)
    for bad in (closed.id, "00000000-0000-0000-0000-000000000000"):
        r = client.post("/api/teams", headers=owner.h, json={"requiredSkills": ["python", "react"], "size": 3, "memberIds": [bad]})
        assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"
    assert client.get("/api/teams", headers=closed.h).json()["items"] == []


def test_declined_invitation_is_recorded(client, make_user, catalog):
    owner = setup_person(client, make_user, "Owner Two", ["python"])
    mate = setup_person(client, make_user, "Mate Two", ["react"])
    tid = client.post("/api/teams", headers=owner.h, json={"requiredSkills": ["python", "react"], "size": 2, "memberIds": [mate.id]}).json()["id"]
    r = client.post(f"/api/teams/{tid}/respond", headers=mate.h, json={"accept": False}).json()
    assert r["myStatus"] == "declined"
    assert any("declined" in n["title"] for n in client.get("/api/notifications", headers=owner.h).json()["items"])
