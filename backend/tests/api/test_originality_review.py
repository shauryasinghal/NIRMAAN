import pytest

from app.engines import originality as eng

UNRELATED = {"title": "Beekeeping telemetry hive monitor", "description": "Low-power acoustic and temperature sensors placed inside beehives, streaming colony health indicators to beekeepers so they can prevent swarming and disease outbreaks."}
NEAR_DUP = {"title": "Teammate matcher for hackathons", "description": "A platform to find teammates for hackathons whose technical skills match or complement yours, so teams have the right mix of abilities."}


def check(client, u, body, **kw):
    return client.post("/api/originality/check", headers=u.h, json={**body, **kw})


def test_unrelated_idea_gets_honest_no_match_wording(client, student, reference_corpus):
    r = check(client, student, UNRELATED)
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["verdict"]["level"] == "no_significant_match" and d["status"] == "novel" and d["verdict"]["needsReview"] is False
    assert d["verdict"]["message"].startswith("No significant semantic match found in the current comparison corpus.")
    assert "not proof of plagiarism" in d["verdict"]["message"] and "100%" not in str(d) and "100% original" not in str(d).lower()
    assert d["method"]["model"] == "all-MiniLM-L6-v2" and d["method"]["corpusSize"] >= 50 and d["method"]["search"] == "pgvector-hnsw-cosine"
    assert d["confidence"] in ("low", "medium", "high") and d["review"] is None
    m = d["matches"][0]
    assert 0 <= m["similarity"] <= 100 and set(m["overlap"]) >= {"semantic", "title", "sharedTerms"}


def test_near_duplicate_is_flagged_queued_and_notified(client, student, reference_corpus, svc):
    d = check(client, student, NEAR_DUP).json()
    assert d["verdict"]["level"] in ("high_overlap", "related_work") and d["matches"][0]["title"] == "Skill-based hackathon teammate finder"
    assert d["topSimilarity"] > 55
    if d["verdict"]["level"] == "high_overlap":
        assert d["status"] == "needs_review" and d["review"]["state"] == "pending" and d["verdict"]["needsReview"] is True
        assert any(n["kind"] == "originality_review" for n in client.get("/api/notifications", headers=student.h).json()["items"])
        assert svc.val("select count(*) from public.reviews where idea_id = cast(:i as uuid)", i=d["id"]) == 1
    hist = client.get("/api/ideas", headers=student.h).json()["items"]
    assert hist[0]["id"] == d["id"] and hist[0]["level"] == d["verdict"]["level"]
    assert svc.val("select count(*) from public.user_events where student_id = cast(:u as uuid) and event_type = 'idea_submit'", u=student.id) == 1
    assert svc.val("select count(*) from public.idea_embeddings where idea_id = cast(:i as uuid)", i=d["id"]) == 1


def test_scores_are_deterministic(client, make_user, reference_corpus):
    a, b = make_user("student", "Det One"), make_user("student", "Det Two")
    ra, rb = check(client, a, NEAR_DUP).json(), check(client, b, NEAR_DUP).json()
    assert ra["topSimilarity"] == rb["topSimilarity"] and [m["id"] for m in ra["matches"]] == [m["id"] for m in rb["matches"]]


def test_full_reviewer_workflow_with_audit(client, make_user, reference_corpus, svc):
    owner, reviewer, other_rev, admin = (make_user("student", "Idea Owner"), make_user("reviewer", "First Reviewer"), make_user("reviewer", "Second Reviewer"), make_user("admin", "Site Admin"))
    idea = check(client, owner, NEAR_DUP).json()
    # force the "needs review" path deterministically even if the similarity lands just under the threshold
    if not idea["review"]:
        svc.run("insert into public.reviews (idea_id) values (cast(:i as uuid))", i=idea["id"])
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=idea["id"])
    # students are locked out of every reviewer/admin route
    for path in (f"/api/reviewer/queue", f"/api/reviewer/reviews/{rid}", "/api/admin/audit", "/api/admin/users"):
        assert client.get(path, headers=owner.h).status_code == 403, path
    assert client.post(f"/api/reviewer/reviews/{rid}/decision", headers=owner.h, json={"decision": "approve"}).status_code == 403
    assert client.put(f"/api/admin/users/{owner.id}/role", headers=reviewer.h, json={"role": "admin"}).status_code == 403
    # reviewer sees the queue and full evidence
    q = client.get("/api/reviewer/queue", headers=reviewer.h).json()
    assert any(i["reviewId"] == rid for i in q["items"])
    d = client.get(f"/api/reviewer/reviews/{rid}", headers=reviewer.h).json()
    assert d["canDecide"] is True and d["idea"]["title"] == NEAR_DUP["title"] and d["matches"] and d["similarity"]["disclaimer"] and "submitterHistory" in d
    # decision rules
    bad = client.post(f"/api/reviewer/reviews/{rid}/decision", headers=reviewer.h, json={"decision": "request_changes"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "validation_error"
    assert client.post(f"/api/reviewer/reviews/{rid}/decision", headers=reviewer.h, json={"decision": "teleport"}).status_code == 422
    ok = client.post(f"/api/reviewer/reviews/{rid}/decision", headers=reviewer.h, json={"decision": "request_changes", "note": "Differentiate from the teammate-finder idea."})
    assert ok.status_code == 200, ok.text
    assert client.post(f"/api/reviewer/reviews/{rid}/decision", headers=other_rev.h, json={"decision": "approve"}).status_code == 409     # already decided
    # owner sees outcome, note and a notification; idea status changed
    mine = client.get(f"/api/ideas/{idea['id']}", headers=owner.h).json()
    assert mine["status"] == "changes_requested" and mine["review"]["state"] == "decided" and mine["review"]["decisions"][0]["note"].startswith("Differentiate")
    assert any(n["kind"] == "reviewer_decision" and "changes requested" in n["body"] for n in client.get("/api/notifications", headers=owner.h).json()["items"])
    # immutable audit trail, visible to admins only
    audit = client.get("/api/admin/audit?action=review_decision", headers=admin.h).json()
    assert any(a["entityId"] == rid and a["detail"]["decision"] == "request_changes" and a["actor"] == reviewer.email for a in audit["items"])
    assert client.get(f"/api/reviewer/reviews/{rid}", headers=reviewer.h).json()["decisions"][0]["reviewer"] == "First"
    with pytest.raises(Exception):
        svc.run("update public.review_decisions set note = 'tampered'")
    with pytest.raises(Exception):
        svc.run("delete from public.review_decisions")


def test_reviewer_cannot_decide_own_idea_and_escalation_needs_admin(client, make_user, reference_corpus, svc):
    rev, rev2, admin = make_user("reviewer", "Self Reviewer"), make_user("reviewer", "Peer Reviewer"), make_user("admin", "Escalation Admin")
    own = check(client, rev, UNRELATED).json()
    svc.run("insert into public.reviews (idea_id) values (cast(:i as uuid)) on conflict do nothing", i=own["id"])
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=own["id"])
    r = client.post(f"/api/reviewer/reviews/{rid}/decision", headers=rev.h, json={"decision": "approve"})
    assert r.status_code == 403 and client.get(f"/api/reviewer/reviews/{rid}", headers=rev.h).json()["canDecide"] is False
    # escalate → reviewers can no longer decide, admins can
    assert client.post(f"/api/reviewer/reviews/{rid}/decision", headers=rev2.h, json={"decision": "escalate", "note": "Needs admin"}).status_code == 200
    assert client.post(f"/api/reviewer/reviews/{rid}/decision", headers=rev2.h, json={"decision": "approve"}).status_code == 403
    assert client.get(f"/api/reviewer/reviews/{rid}", headers=rev2.h).json()["canDecide"] is False
    assert any(i["reviewId"] == rid for i in client.get("/api/reviewer/queue?state=escalated", headers=admin.h).json()["items"])
    assert client.post(f"/api/reviewer/reviews/{rid}/decision", headers=admin.h, json={"decision": "approve", "note": "Fine."}).status_code == 200
    assert client.get(f"/api/ideas/{own['id']}", headers=rev.h).json()["status"] == "approved"


def test_peer_overlap_is_recorded_for_reviewers_and_hidden_from_the_student(client, make_user, reference_corpus, svc):
    a, b, rev = make_user("student", "Peer A"), make_user("student", "Peer B"), make_user("reviewer", "Peer Reviewer Two")
    first = check(client, a, UNRELATED).json()
    second = check(client, b, {"title": "Hive health monitor with sensors", "description": UNRELATED["description"]}).json()
    assert second["peerOverlapsExist"] is True and first["id"] not in {m["id"] for m in second["matches"]}
    assert second["topSimilarity"] >= 75 and second["verdict"]["needsReview"] is True
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=second["id"])
    ev = client.get(f"/api/reviewer/reviews/{rid}", headers=rev.h).json()
    peers = [m for m in ev["matches"] if m["kind"] == "peer submission"]
    assert peers and all(p["shownToSubmitter"] is False and p["similarity"] >= 75 for p in peers)   # identical earlier submissions all tie
    assert first["id"] not in {m["id"] for m in client.get(f"/api/ideas/{second['id']}", headers=b.h).json()["matches"]}


def test_idor_and_validation_and_delete(client, make_user, reference_corpus):
    a, b = make_user("student", "Owner A"), make_user("student", "Snoop B")
    idea = check(client, a, UNRELATED).json()
    assert client.get(f"/api/ideas/{idea['id']}", headers=b.h).status_code == 404
    assert client.delete(f"/api/ideas/{idea['id']}", headers=b.h).status_code == 404
    assert client.get("/api/ideas", headers=b.h).json()["items"] == []
    for bad in ({"title": "ab", "description": "x" * 30}, {"title": "Fine title", "description": "short"}, {**UNRELATED, "ownerId": "x"}, {**UNRELATED, "opportunityId": "nope"}):
        assert check(client, a, bad).status_code in (404, 422)
    assert client.delete(f"/api/ideas/{idea['id']}", headers=a.h).status_code == 204
    assert client.get(f"/api/ideas/{idea['id']}", headers=a.h).status_code == 404


def test_deleting_a_reviewed_idea_is_allowed_and_audit_survives(client, make_user, reference_corpus, svc):
    o, rev = make_user("student", "Delete Me"), make_user("reviewer", "Del Reviewer")
    idea = check(client, o, UNRELATED).json()
    svc.run("insert into public.reviews (idea_id) values (cast(:i as uuid)) on conflict do nothing", i=idea["id"])
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=idea["id"])
    assert client.post(f"/api/reviewer/reviews/{rid}/decision", headers=rev.h, json={"decision": "approve"}).status_code == 200
    assert client.delete(f"/api/ideas/{idea['id']}", headers=o.h).status_code == 204      # FK cascade may remove decisions…
    assert svc.val("select count(*) from public.audit_log where entity_id = :r", r=rid) == 1   # …the audit row stays


def test_embedding_outage_fails_closed_and_saves_nothing(client, student, svc):
    class Down:
        name, dim = "all-MiniLM-L6-v2", 384
        def encode(self, texts): raise eng.EmbeddingUnavailable("nope")
    eng.set_embedder(Down())
    try:
        r = check(client, student, UNRELATED)
    finally:
        eng.set_embedder(None)
    assert r.status_code == 503 and r.json()["error"]["code"] == "service_unavailable"
    assert svc.val("select count(*) from public.ideas where owner_id = cast(:u as uuid)", u=student.id) == 0


def test_originality_is_rate_limited(client, student, reference_corpus):
    codes = [check(client, student, {**UNRELATED, "title": f"Hive monitor {i}"}).status_code for i in range(14)]
    assert codes.count(201) == 12 and codes[-1] == 429


def test_admin_role_management_is_audited_and_protected(client, make_user):
    admin, target = make_user("admin", "Role Admin"), make_user("student", "Promotee")
    assert client.put(f"/api/admin/users/{target.id}/role", headers=admin.h, json={"role": "reviewer"}).status_code == 200
    assert client.get("/api/auth/me", headers=target.h).json()["role"] == "reviewer"
    assert client.put(f"/api/admin/users/{target.id}/role", headers=admin.h, json={"role": "superuser"}).status_code == 422
    assert client.put(f"/api/admin/users/{target.id}/role", headers=admin.h, json={"role": "reviewer", "extra": 1}).status_code == 422
    assert client.put("/api/admin/users/00000000-0000-0000-0000-000000000000/role", headers=admin.h, json={"role": "student"}).status_code == 404
    log = client.get("/api/admin/audit?action=role_changed", headers=admin.h).json()["items"]
    assert any(a["entityId"] == target.id and a["detail"]["to"] == "reviewer" and a["actor"] == admin.email for a in log)
    users = client.get("/api/admin/users?q=Promotee", headers=admin.h).json()
    assert users["total"] >= 1 and users["items"][0]["role"] == "reviewer"
