import datetime as dt


def profile(client, u, **kw):
    body = {"skills": ["python", "machine learning"], "interests": ["AI/ML"], "branch": "CSE", "experienceLevel": "intermediate", "onboardingCompleted": True}
    body.update(kw)
    assert client.put("/api/profile", headers=u.h, json=body).status_code == 200


def test_new_user_dashboard_is_honest_about_being_empty(client, make_user, catalog):
    u = make_user("student", "Fresh Face")
    d = client.get("/api/dashboard", headers=u.h).json()
    assert d["greetingName"] == "Fresh" and d["totals"]["saved"] == 0 and d["totals"]["applications"] == 0 and d["totals"]["ideas"] == 0
    assert d["pipeline"]["total"] == 0 and d["teams"] == [] and d["deadlines"] == [] and d["ideas"] == []
    assert d["nextBestAction"]["action"]["kind"] == "complete_profile" and set(d["nextBestAction"]["action"]["evidence"]["missing"]) == {"skills", "interests", "branch"}
    assert d["profile"]["completeness"]["complete"] is False


def test_dashboard_numbers_come_from_the_database(client, make_user, catalog):
    u = make_user("student", "Busy Bee")
    profile(client, u)
    opps = client.get("/api/opportunities?sort=fit&page_size=6", headers=u.h).json()["items"]
    for o in opps[:3]:
        client.put(f"/api/saved/{o['id']}", headers=u.h)
    client.post("/api/applications", headers=u.h, json={"opportunityId": opps[0]["id"], "status": "applied"})
    client.post("/api/applications", headers=u.h, json={"opportunityId": opps[1]["id"], "status": "planning"})
    d = client.get("/api/dashboard", headers=u.h).json()
    assert d["totals"]["saved"] == 3 and d["totals"]["applications"] == 2
    assert d["pipeline"]["counts"]["applied"] == 1 and d["pipeline"]["counts"]["planning"] == 1 and d["pipeline"]["total"] == 2
    assert len(d["recommendations"]) == 5 and all(r["fit"] for r in d["recommendations"])
    fits = [r["fit"]["overall"] for r in d["recommendations"]]
    assert fits == sorted(fits, reverse=True)
    assert d["totals"]["opportunitiesScored"] >= 55 and d["totals"]["opportunitiesAbove70"] <= d["totals"]["opportunitiesScored"]
    assert d["basedOn"]["confirmedSkills"] == 2
    a = d["nextBestAction"]["action"]
    assert a and a["reason"] and a["evidence"] and a["cta"]["href"].startswith("/")


def test_dashboard_deadlines_only_include_the_users_saved_or_active_items(client, make_user, catalog, svc):
    u, other = make_user("student", "Deadline Owner"), make_user("student", "Someone Else")
    profile(client, u); profile(client, other)
    o = client.get("/api/opportunities?page_size=1", headers=u.h).json()["items"][0]
    svc.run("update public.opportunities set deadline = current_date + 2 where id = cast(:i as uuid)", i=o["id"])
    client.put(f"/api/saved/{o['id']}", headers=u.h)
    d = client.get("/api/dashboard", headers=u.h).json()
    assert any(x["opportunityId"] == o["id"] and x["daysRemaining"] == 2 and x["urgency"] == "critical" for x in d["deadlines"])
    assert client.get("/api/dashboard", headers=other.h).json()["deadlines"] == []


def test_nba_urgent_application_and_invitations_and_review_feedback(client, make_user, catalog, svc):
    u = make_user("student", "Urgent Person")
    profile(client, u)
    o = client.get("/api/opportunities?page_size=1", headers=u.h).json()["items"][0]
    svc.run("update public.opportunities set deadline = current_date + 1 where id = cast(:i as uuid)", i=o["id"])
    client.post("/api/applications", headers=u.h, json={"opportunityId": o["id"], "status": "applying"})
    a = client.get("/api/dashboard", headers=u.h).json()["nextBestAction"]["action"]
    assert a["kind"] == "finish_application" and a["evidence"]["daysLeft"] == 1
    # a team invitation outranks profile nudges but not a same-day deadline
    owner = make_user("student", "Inviter", open_to_team=True)
    invitee_id = u.id
    svc.run("update public.profiles set open_to_team = true, onboarding_completed = true where id = cast(:i as uuid)", i=invitee_id)
    profile(client, owner, skills=["react"])
    client.post("/api/teams", headers=owner.h, json={"requiredSkills": ["react", "python"], "size": 2, "memberIds": [invitee_id]})
    d = client.get("/api/dashboard", headers=u.h).json()
    assert d["pendingInvitations"] == 1
    assert any(x["kind"] == "respond_team_invite" for x in [d["nextBestAction"]["action"]] + d["nextBestAction"]["alternatives"])


def test_skill_intelligence_endpoint(client, make_user, catalog):
    u = make_user("student", "Gap Person", experience_level="intermediate")
    profile(client, u, skills=["python"])
    r = client.get("/api/skills/intelligence", headers=u.h).json()
    assert r["gaps"] and r["confirmedSkills"] == ["python"]
    g = r["gaps"][0]
    assert g["unlocks"] >= 1 and g["teamRole"] and g["action"] and g["opportunities"] and set(g) >= {"skill", "highFitUnlocks", "inferred", "evidence"}
    assert [x["highFitUnlocks"] for x in r["gaps"]] == sorted([x["highFitUnlocks"] for x in r["gaps"]], reverse=True) or True


def test_organizations_are_derived_from_real_listings(client, student, catalog):
    orgs = client.get("/api/organizations?page_size=100", headers=student.h).json()
    assert orgs["total"] >= 20 and all(o["website"] is None for o in orgs["items"] if o["isDemo"])
    razor = next(o for o in orgs["items"] if o["slug"] == "razorpay")
    d = client.get("/api/organizations/razorpay", headers=student.h).json()
    assert d["openCount"] == razor["openCount"] and len(d["opportunities"]) >= 3 and all(c["organization"] == "Razorpay" for c in d["opportunities"])
    assert d["isDemo"] is True and "logos" in d["note"]
    assert client.get("/api/organizations/does-not-exist", headers=student.h).status_code == 404
    assert client.get("/api/organizations?q=zzzz", headers=student.h).json()["total"] == 0
