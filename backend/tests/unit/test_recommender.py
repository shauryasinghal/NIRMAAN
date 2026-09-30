import datetime as dt
from dataclasses import replace

from app.engines.recommender import WEIGHTS, build_affinity, build_domain_profiles, score_fit
from app.engines.types import Affinity, FitContext, OppSignals, StudentSignals

TODAY = dt.date(2026, 9, 30)
CTX = FitContext(today=TODAY)


def student(**kw):
    base = dict(id="s1", skills=frozenset({"python", "machine learning", "nlp"}), interests=frozenset({"ai/ml"}), level="intermediate",
                availability_hrs=10, participation_pref="team", preferred_format="online")
    base.update(kw)
    return StudentSignals(**base)


def opp(**kw):
    base = dict(id="o1", title="AI Hack", domain="ai/ml", category="Hackathon", required=frozenset({"python", "machine learning", "docker"}),
                preferred=frozenset({"nlp"}), difficulty="intermediate", format="online", participation="team",
                deadline=TODAY + dt.timedelta(days=30))
    base.update(kw)
    return OppSignals(**base)


def test_weights_sum_to_one():
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9


def test_deterministic_same_inputs_same_output():
    a, b = score_fit(student(), opp(), CTX), score_fit(student(), opp(), CTX)
    assert a.as_dict() == b.as_dict()


def test_skill_component_counts_required_and_preferred():
    r = score_fit(student(), opp(), CTX)
    skill = next(c for c in r.components if c.key == "skill")
    assert r.matched_skills == ["machine learning", "python"] and r.missing_skills == ["docker"]
    assert round(skill.score, 3) == round(0.8 * 2 / 3 + 0.2 * 1, 3)
    assert skill.detail == "2/3 required skills, 1/1 preferred"


def test_unknown_inputs_are_excluded_not_guessed():
    r = score_fit(student(preferred_format=None), opp(deadline=None, participation=None), CTX)
    unknown = {c.key for c in r.components if c.score is None}
    assert {"format", "deadline", "participation", "behavior"} <= unknown
    assert r.confidence in ("medium", "low")
    blank = score_fit(student(skills=frozenset(), interests=frozenset()), opp(), CTX)
    assert next(c for c in blank.components if c.key == "skill").score is None and blank.confidence == "low" and blank.overall < 45
    # renormalised over known weights only: with everything known == 1.0 the max is 100
    perfect = score_fit(student(skills=frozenset({"python", "machine learning", "docker", "nlp"})), opp(), replace(CTX, affinity=Affinity(n_events=10, category={"Hackathon": 1}, domain={"ai/ml": 1}, skill={"python": 1, "machine learning": 1, "docker": 1, "nlp": 1})))
    assert 95 <= perfect.overall <= 100


def test_more_matching_skills_never_lowers_fit():
    lo = score_fit(student(skills=frozenset({"python"})), opp(), CTX).overall
    hi = score_fit(student(skills=frozenset({"python", "machine learning", "docker"})), opp(), CTX).overall
    assert hi > lo


def test_expired_opportunity_is_capped_and_flagged():
    r = score_fit(student(skills=frozenset({"python", "machine learning", "docker", "nlp"})), opp(deadline=TODAY - dt.timedelta(days=2)), CTX)
    assert r.expired and r.overall <= 30
    assert "The registration deadline has passed" in r.concerns


def test_deadline_in_three_days_raises_concern_and_lower_feasibility():
    r = score_fit(student(), opp(deadline=TODAY + dt.timedelta(days=3)), CTX)
    assert "Deadline in 3 days" in r.concerns
    assert next(c for c in r.components if c.key == "deadline").score < 0.5


def test_experience_alignment_table():
    s = lambda lvl: next(c.score for c in score_fit(student(level=lvl), opp(difficulty="intermediate"), CTX).components if c.key == "experience")
    assert (s("intermediate"), s("advanced"), s("beginner")) == (1.0, 0.85, 0.5)


def test_reasons_come_from_real_data_only():
    r = score_fit(student(), opp(), CTX)
    assert any(x.startswith("2/3 required skills") for x in r.reasons)
    assert "Difficulty matches your experience" in r.reasons and "Preferred format" in r.reasons
    assert any("Missing 1 required skill: docker" in c for c in r.concerns)


def test_behaviour_needs_minimum_events_then_moves_score():
    cold = score_fit(student(), opp(), CTX)
    assert next(c for c in cold.components if c.key == "behavior").score is None
    warm_ctx = replace(CTX, affinity=Affinity(n_events=8, category={"Hackathon": 3.0}, domain={"ai/ml": 3.0}, skill={"python": 2.0}))
    warm = score_fit(student(), opp(), warm_ctx)
    assert next(c for c in warm.components if c.key == "behavior").score > 0.5


def test_dismissed_opportunity_scores_zero_on_behaviour():
    r = score_fit(student(), opp(), replace(CTX, affinity=Affinity(n_events=9, dismissed=frozenset({"o1"}))))
    b = next(c for c in r.components if c.key == "behavior")
    assert b.score == 0.0 and "dismissed" in b.detail


def test_domain_profiles_and_affinity_builders():
    prof = build_domain_profiles([("ai/ml", "python", 5), ("ai/ml", "nlp", 3), ("web", "react", 4), ("web", "python", 1)])
    assert prof["ai/ml"]["nlp"] > prof["ai/ml"].get("react", 0)
    o1 = opp(id="a", category="Hackathon", domain="ai/ml")
    aff = build_affinity([{"type": "save", "opportunity_id": "a", "days_ago": 0}] * 3 + [{"type": "dismiss", "opportunity_id": "b", "days_ago": 1}] + [{"type": "opportunity_view", "opportunity_id": "a", "days_ago": 42}] * 2, {"a": o1}, TODAY)
    assert aff.n_events == 5 and aff.dismissed == frozenset({"b"}) and aff.category["Hackathon"] > 4
