import datetime as dt
from dataclasses import replace

from app.engines.next_best_action import next_best_actions
from app.engines.originality import classify, overlap_dimensions, shared_terms
from app.engines.skill_intelligence import compute_skill_gaps
from app.engines.team_builder import Member, build_team, team_metrics
from app.engines.types import FitContext, OppSignals, StudentSignals
from app.engines.why_not import explain_blockers
from app.engines.recommender import score_fit

TODAY = dt.date(2026, 9, 30)
CTX = FitContext(today=TODAY)
S = StudentSignals(id="s", skills=frozenset({"python"}), interests=frozenset({"fintech"}), level="beginner", availability_hrs=6, participation_pref="individual", preferred_format="online", location="Mathura", education_level="undergraduate")


def O(**kw):
    base = dict(id="o", title="ML Cup", domain="ai/ml", category="Hackathon", required=frozenset({"python", "docker", "machine learning"}),
                difficulty="advanced", format="offline", participation="team", min_team=3, max_team=4, location="Bengaluru",
                deadline=TODAY + dt.timedelta(days=2), education_requirements="Open to postgraduate students")
    base.update(kw); return OppSignals(**base)


# ── why-not ─────────────────────────────────────────────────────────────────────────────────
def test_why_not_lists_real_blockers_with_impact():
    ctx = FitContext(today=TODAY, domain_profiles={"ai/ml": {"machine learning": 1.0, "nlp": 0.8}})
    fit = score_fit(S, O(), ctx)
    out = explain_blockers(S, O(), fit, ctx)
    kinds = [b["kind"] for b in out["blockers"]]
    assert {"missing_skill", "deadline", "difficulty", "team_size", "format", "location", "eligibility", "domain_mismatch"} <= set(kinds)
    ms = [b for b in out["blockers"] if b["kind"] == "missing_skill"]
    assert {b["title"] for b in ms} == {"docker missing", "machine learning missing"} and all(b["impact"] > 0 for b in ms)
    assert out["blockers"][0]["severity"] == "blocker"


def test_why_not_free_text_eligibility_is_verify_not_fail():
    out = explain_blockers(S, O(education_requirements=None, eligibility="Must be enrolled in an Indian college"), score_fit(S, O(), CTX), CTX)
    assert out["verify"] == ["Must be enrolled in an Indian college"]
    assert not any(b["kind"] == "eligibility" for b in out["blockers"])


def test_why_not_no_blockers_for_perfect_fit():
    s = replace(S, skills=frozenset({"python", "docker", "machine learning"}), level="advanced", participation_pref="team", interests=frozenset({"ai/ml"}), location="Bengaluru", preferred_format="offline")
    o = O(deadline=TODAY + dt.timedelta(days=40), education_requirements=None)
    out = explain_blockers(s, o, score_fit(s, o, CTX), CTX)
    # only the informational "needs at least 3 people" note remains; nothing blocks or warns
    assert [b["severity"] for b in out["blockers"]] == ["info"] and out["mainBlockers"] == []


# ── skill intelligence ──────────────────────────────────────────────────────────────────────
def test_skill_gap_unlocks_are_recomputed_not_guessed():
    s = replace(S, skills=frozenset({"python", "machine learning"}), level="intermediate", participation_pref="either", interests=frozenset({"ai/ml"}))
    opps = [O(id=f"o{i}", required=frozenset({"python", "machine learning", "docker"}), difficulty="intermediate", deadline=TODAY + dt.timedelta(days=30), format="online", participation="individual", education_requirements=None, location=None) for i in range(3)]
    gaps = compute_skill_gaps(s, opps, CTX, limit=3)
    assert gaps[0]["skill"] == "docker" and gaps[0]["unlocks"] == 3 and gaps[0]["teamRole"] == "DevOps / Cloud Engineer"
    assert gaps[0]["highFitUnlocks"] <= 3 and "Learn docker" in gaps[0]["action"]


def test_inferred_skill_is_flagged_not_counted():
    s = replace(S, skills=frozenset({"python"}), inferred_skills=frozenset({"docker"}))
    gaps = compute_skill_gaps(s, [O(required=frozenset({"python", "docker"}), difficulty="beginner", deadline=None)], CTX,
                              evidence={"docker": [{"source": "resume", "evidence": "Docker mentioned"}]})
    assert gaps[0]["inferred"] is True and gaps[0]["action"].startswith("Confirm docker")


# ── next best action ────────────────────────────────────────────────────────────────────────
def test_nba_priority_and_evidence():
    st = {"profile": {"has_skills": True, "has_interests": True, "has_branch": True},
          "applications": [{"id": "a1", "opportunity_id": "o1", "title": "SIH", "status": "planning", "days_left": 2, "idle_days": 1}],
          "recommendations": [{"id": "o9", "title": "Kaggle", "fit": 88, "days_left": 5}], "saved": [], "saved_ids": [], "ideas": [], "team_invitations": [], "skill_gaps": []}
    out = next_best_actions(st, TODAY)
    assert out["action"]["kind"] == "finish_application" and out["action"]["evidence"]["daysLeft"] == 2
    assert out["alternatives"][0]["kind"] == "review_high_fit"


def test_nba_says_nothing_when_nothing_applies():
    out = next_best_actions({"profile": {"has_skills": True, "has_interests": True, "has_branch": True}}, TODAY)
    assert out["action"] is None and out["message"]


def test_nba_incomplete_profile_first():
    out = next_best_actions({"profile": {"has_skills": False, "has_interests": True, "has_branch": True}}, TODAY)
    assert out["action"]["kind"] == "complete_profile" and out["action"]["evidence"]["missing"] == ["skills"]


# ── team builder ────────────────────────────────────────────────────────────────────────────
def M(i, skills, lvl="intermediate", hrs=8, interests=()):
    return Member(id=i, name=f"P{i} X", skills=frozenset(skills), level=lvl, availability_hrs=hrs, interests=frozenset(interests))


def test_team_builder_covers_gaps_and_stops_when_complete():
    owner = M("me", {"python"})
    cands = [M("a", {"react", "css"}), M("b", {"machine learning", "nlp"}), M("c", {"python"}), M("d", {"figma", "ui/ux"})]
    out = build_team(["python", "react", "machine learning"], ["ui/ux"], owner, cands, size=5)
    ids = [m["id"] for m in out["members"]]
    assert ids[0] == "me" and set(ids[1:]) == {"a", "b", "d"} or set(ids[1:]) == {"a", "b"}
    assert "c" not in ids and out["uncovered"] == [] and out["metrics"]["skillCoverage"] == 1.0
    assert "adding more would only add redundancy" in out["summary"] or "Every required skill is covered" in out["summary"]


def test_team_builder_reports_uncoverable_skills_honestly():
    out = build_team(["python", "iot"], [], M("me", {"python"}), [M("a", {"react"})], size=3)
    assert out["uncovered"] == ["iot"] and "No available candidate covers: iot" in out["summary"]


def test_team_builder_is_deterministic():
    owner, cands = M("me", {"python"}), [M(str(i), {"react", "css"}) for i in range(5)]
    a = build_team(["python", "react"], [], owner, cands, 3); b = build_team(["python", "react"], [], owner, list(reversed(cands)), 3)
    assert [m["id"] for m in a["members"]] == [m["id"] for m in b["members"]]


def test_team_metrics_no_demographics_and_bounded():
    m = team_metrics([M("a", {"python"}), M("b", {"react"})], frozenset({"python", "react", "sql"}))
    assert 0 <= m["score"] <= 1 and round(m["skillCoverage"], 3) == round(2 / 3, 3) and "demographic" in m["note"]


def test_team_member_explanations_are_specific():
    out = build_team(["python", "react"], [], M("me", {"python"}), [M("a", {"react", "css"})], 3)
    a = next(m for m in out["members"] if m["id"] == "a")
    assert a["contributedSkills"] == ["react"] and a["complementarySkills"] == ["css"] and a["role"] == "Frontend Engineer" and "react" in a["why"]


# ── originality decision logic ──────────────────────────────────────────────────────────────
def test_originality_wording_never_claims_100_percent():
    for top in (0.0, 0.3, 0.6, 0.9):
        msg = classify(top, 50, 0.75, 0.55)["message"]
        assert "100%" not in msg and "original" not in msg.lower().replace("originality", "") or "not proof" in msg
        assert "not proof of plagiarism" in msg
    assert classify(0.2, 50, 0.75, 0.55)["message"].startswith("No significant semantic match found in the current comparison corpus.")


def test_originality_levels_and_review_routing():
    assert classify(0.8, 50, 0.75, 0.55)["needsReview"] is True
    assert classify(0.6, 50, 0.75, 0.55)["level"] == "related_work"
    assert classify(0.2, 50, 0.75, 0.55)["level"] == "no_significant_match"
    assert classify(None, 0, 0.75, 0.55)["level"] == "no_corpus"
    assert classify(0.2, 5, 0.75, 0.55)["confidence"] == "low"


def test_overlap_dimensions():
    d = overlap_dimensions("Smart irrigation", "IoT sensors water crops", "iot", {"similarity": 0.8, "title": "Drip irrigation", "description": "sensors control water for crops", "domain": "iot"}, 0.6)
    assert d["sameDomain"] is True and "crops" in d["sharedTerms"] and d["semantic"] == 0.8
    assert shared_terms("alpha beta", "gamma") == []
