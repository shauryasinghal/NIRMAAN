"""End-to-end behaviour of the Gemini deep-analysis stage through the API: real MiniLM + pgvector for stages 1–2 (skipped when the weights are
unavailable), a fake Gemini client for stage 3. Covers auth, authorisation, user isolation, enabled/disabled states, provider failures and
the stored report."""
import pytest

from app.core.config import reset_settings_cache
from app.integrations import gemini_originality as go
from app.schemas.originality import GeminiReportWire
from app.services.originality_ai import AI_DISCLAIMER
from tests.unit.test_originality_ai_client import KEY, wire_report

NEAR = {"title": "Lab equipment booking system", "description": "A scheduling system for students to reserve shared lab equipment slots."}
FULL = {"title": "Lab equipment waitlist and booking", "description": "Students reserve shared lab equipment and join a waitlist when all slots are taken, with reminders before each slot.",
        "problemStatement": "Equipment sits idle while students queue informally.", "objectives": "Fair access; fewer no-shows.", "proposedSolution": "A booking calendar with a waitlist and SMS reminders.",
        "technologies": "Django, Postgres, Twilio", "additionalContext": "Pilot in the chemistry department."}


class FakeClient:
    """Stands in for GeminiOriginalityClient: records the prompt it was given and returns a scripted wire report or raises a scripted error."""
    def __init__(self, outcome="ok", keys=None):
        self.outcome, self.keys, self.calls = outcome, keys, []
        self.model = "gemini-3.5-flash-lite"

    def analyse(self, *, system, prompt, schema):
        self.calls.append({"system": system, "prompt": prompt, "schema": schema})
        if isinstance(self.outcome, Exception):
            raise self.outcome
        keys = self.keys or [line.split(":")[0].strip("- ") for line in prompt.splitlines() if line.startswith("- m")]
        return go.AIResult(data=GeminiReportWire.model_validate(wire_report(tuple(keys))), attempts=1, duration_ms=12.5, input_tokens=900, output_tokens=400, finish_reason="STOP")


@pytest.fixture()
def ai_on(monkeypatch):
    monkeypatch.setenv("ORIGINALITY_AI_ENABLED", "true"); monkeypatch.setenv("GEMINI_API_KEY", KEY)
    reset_settings_cache()
    fake = FakeClient()
    go.set_client(fake)
    yield fake
    go.set_client(None); reset_settings_cache()


@pytest.fixture()
def ai_off(monkeypatch):
    monkeypatch.setenv("ORIGINALITY_AI_ENABLED", "false")
    reset_settings_cache(); go.set_client(None)
    yield
    reset_settings_cache()


def check(client, u, body):
    r = client.post("/api/originality/check", headers=u.h, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def analyse(client, u, idea_id, **params):
    return client.post(f"/api/ideas/{idea_id}/ai-analysis", headers=u.h, params=params)


# ── stages 1–2 with structured input ─────────────────────────────────────────────────────────
def test_structured_sections_are_compared_stored_and_returned_without_changing_the_description(client, student, reference_corpus, svc):
    d = check(client, student, FULL)
    assert d["description"] == FULL["description"] and d["sections"] == {"problem_statement": FULL["problemStatement"], "objectives": FULL["objectives"], "proposed_solution": FULL["proposedSolution"],
                                                                         "technologies": FULL["technologies"], "additional_context": FULL["additionalContext"]}
    assert d["coverage"]["words"] > len(FULL["description"].split()) + 10         # the sections were part of the compared text
    assert d["matches"][0]["title"] == "Lab equipment booking system" and d["verdict"]["level"] in ("related_work", "high_overlap")
    assert svc.val("select analysis -> 'input' ->> 'technologies' from public.ideas where id = cast(:i as uuid)", i=d["id"]) == FULL["technologies"]
    plain = check(client, student, NEAR)
    assert plain["sections"] is None and "aiAnalysis" in plain


def test_check_without_sections_is_byte_for_byte_the_old_contract_plus_additive_fields(client, student, reference_corpus, ai_off):
    d = check(client, student, NEAR)
    for key in ("id", "title", "description", "verdict", "method", "matches", "coverage", "duplicateSignal", "display", "previousChecks", "review", "disclaimer"):
        assert key in d, key
    assert d["aiAnalysis"]["status"] == "disabled" and d["aiAnalysis"]["error"]["code"] == "not_configured"


# ── stage 3: disabled / enabled ──────────────────────────────────────────────────────────────
def test_disabled_server_reports_the_stage_as_disabled_and_the_semantic_result_stands(client, student, reference_corpus, ai_off):
    d = check(client, student, NEAR)
    r = analyse(client, student, d["id"])
    assert r.status_code == 200 and r.json()["status"] == "disabled" and r.json()["model"] is None
    assert client.get("/api/originality/status", headers=student.h).json()["ai"]["enabled"] is False
    assert client.get(f"/api/ideas/{d['id']}", headers=student.h).json()["verdict"] == d["verdict"]


def test_full_pipeline_check_then_deep_analysis_then_stored_report(client, student, reference_corpus, ai_on, svc):
    assert client.get("/api/originality/status", headers=student.h).json()["ai"] == {"enabled": True, "provider": "Google Gemini", "model": "gemini-3.5-flash-lite", "disclaimer": AI_DISCLAIMER}
    d = check(client, student, FULL)
    assert d["aiAnalysis"]["status"] == "pending"
    r = analyse(client, student, d["id"])
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["status"] == "completed" and a["provider"] == "Google Gemini" and a["model"] == "gemini-3.5-flash-lite" and a["attempts"] == 1
    rep = a["report"]
    assert rep["overallSummary"] and rep["confidence"] == "medium" and rep["limitations"] and rep["suggestions"][0]["kind"] == "new_feature"
    shown = {m["id"] for m in d["matches"]}
    assert rep["matches"] and all(m["id"] in shown for m in rep["matches"]) and rep["matchesNotAssessed"] == []
    first = rep["matches"][0]
    assert first["relationshipLabel"] == "Similar problem, different solution" and first["problemSimilarity"]["level"] == "high" and first["similarity"] == d["matches"][0]["similarity"]
    # the measured side is labelled separately from the AI side
    assert a["embedding"]["topSimilarity"] == d["topSimilarity"] and a["embedding"]["band"]["band"] in ("low", "moderate", "high") and a["embedding"]["thresholds"] == {"review": 0.75, "related": 0.45}
    assert "not a plagiarism finding" in a["disclaimer"] and "100%" not in str(rep)
    # persisted next to the semantic result, and returned with the idea afterwards (also in history)
    stored = client.get(f"/api/ideas/{d['id']}", headers=student.h).json()
    assert stored["aiAnalysis"]["status"] == "completed" and stored["aiAnalysis"]["report"] == rep and stored["verdict"] == d["verdict"] and stored["topSimilarity"] == d["topSimilarity"]
    assert client.get("/api/ideas", headers=student.h).json()["items"][0]["aiStatus"] == "completed"
    assert svc.val("select analysis -> 'ai' ->> 'status' from public.ideas where id = cast(:i as uuid)", i=d["id"]) == "completed"
    # what was sent: the student's texts + reference matches only — no ids, no identity
    prompt = ai_on.calls[0]["prompt"]
    assert FULL["description"] in prompt and "Problem statement: " + FULL["problemStatement"] in prompt and "Technologies used: Django" in prompt
    assert "Lab equipment booking system" in prompt and a["inputs"]["matchesSent"] == len(rep["matches"]) and a["inputs"]["peerSubmissionsSent"] == 0
    for leak in (student.id, student.email, d["id"], "Stu Dent"):
        assert leak not in prompt and leak not in ai_on.calls[0]["system"]


def test_a_completed_report_is_reused_not_regenerated_unless_forced(client, student, reference_corpus, ai_on):
    d = check(client, student, NEAR)
    analyse(client, student, d["id"]); analyse(client, student, d["id"])
    assert len(ai_on.calls) == 1
    assert analyse(client, student, d["id"], force="true").status_code == 200 and len(ai_on.calls) == 2


def test_peer_submissions_are_never_sent_to_gemini(client, make_user, reference_corpus, ai_on):
    a, b = make_user("student", "Peer Alpha"), make_user("student", "Peer Beta")
    secret = {"title": "Typewriter ribbon re-inking jig", "description": "A jig and ink cartridge for collectors restoring vintage typewriter ribbons; niche marker word only this private submission contains: zorblatt."}
    check(client, a, secret)
    d = check(client, b, secret)
    assert d["peerOverlapsExist"] is True
    analyse(client, b, d["id"])
    prompt = ai_on.calls[-1]["prompt"]
    assert "zorblatt" in prompt            # the submitter's OWN text is there …
    assert prompt.count("zorblatt") == 1   # … but the other student's identical private submission is not


# ── provider failures: reported, never fabricated ────────────────────────────────────────────
@pytest.mark.parametrize("code", ["invalid_key", "timeout", "busy", "unavailable", "malformed", "blocked", "model_unavailable"])
def test_provider_failures_are_reported_as_unavailable_with_safe_wording(client, student, reference_corpus, ai_on, code):
    ai_on.outcome = go.OriginalityAIError(code)
    d = check(client, student, NEAR)
    r = analyse(client, student, d["id"])
    assert r.status_code == 200
    a = r.json()
    assert a["status"] == "unavailable" and a["error"] == {"code": code, "message": go.MESSAGES[code]} and "report" not in a
    stored = client.get(f"/api/ideas/{d['id']}", headers=student.h).json()
    assert stored["aiAnalysis"]["status"] == "unavailable" and stored["verdict"]["level"] == d["verdict"]["level"]      # semantic result untouched
    # a later retry is allowed and can succeed
    ai_on.outcome = "ok"
    assert analyse(client, student, d["id"]).json()["status"] == "completed"


def test_unexpected_crash_is_a_safe_unavailable_envelope(client, student, reference_corpus, ai_on):
    ai_on.outcome = RuntimeError("secret internal detail AIzaSyFAKE-FAKE-FAKE-FAKE-FAKE-FAKE-000")
    d = check(client, student, NEAR)
    a = analyse(client, student, d["id"]).json()
    assert a["status"] == "unavailable" and a["error"]["code"] == "server_error" and "AIzaSy" not in a["error"]["message"] and "secret internal" not in str(a)


# ── auth, authorisation, isolation, limits ───────────────────────────────────────────────────
def test_requires_authentication(client, student, reference_corpus, ai_on):
    d = check(client, student, NEAR)
    assert client.post(f"/api/ideas/{d['id']}/ai-analysis").status_code == 401
    assert client.post(f"/api/ideas/{d['id']}/ai-analysis", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/originality/status").status_code == 401


def test_another_student_cannot_analyse_or_read_someone_elses_idea(client, make_user, reference_corpus, ai_on):
    owner, snoop = make_user("student", "AI Owner"), make_user("student", "AI Snoop")
    d = check(client, owner, NEAR)
    assert analyse(client, snoop, d["id"]).status_code == 404 and ai_on.calls == []
    assert analyse(client, snoop, "not-a-uuid").status_code == 404
    assert analyse(client, snoop, "00000000-0000-0000-0000-000000000000").status_code == 404
    assert client.get(f"/api/ideas/{d['id']}", headers=snoop.h).status_code == 404
    assert analyse(client, owner, d["id"]).json()["status"] == "completed"


def test_reviewers_see_the_report_as_evidence_but_cannot_trigger_it_for_others(client, make_user, reference_corpus, ai_on, svc):
    owner, rev = make_user("student", "AI Reviewed"), make_user("reviewer", "AI Reviewer")
    d = check(client, owner, FULL)
    analyse(client, owner, d["id"])
    svc.run("insert into public.reviews (idea_id) values (cast(:i as uuid)) on conflict do nothing", i=d["id"])
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=d["id"])
    ev = client.get(f"/api/reviewer/reviews/{rid}", headers=rev.h).json()
    assert ev["aiAnalysis"]["status"] == "completed" and ev["aiAnalysis"]["report"]["matches"] and ev["sections"]["technologies"] == FULL["technologies"]
    assert analyse(client, rev, d["id"]).status_code == 404        # the endpoint is owner-only


def test_deep_analysis_is_rate_limited_per_user_only_when_enabled(client, make_user, reference_corpus, ai_on, monkeypatch):
    monkeypatch.setenv("ORIGINALITY_AI_RATE_LIMIT_PER_MINUTE", "2"); reset_settings_cache()
    u = make_user("student", "AI Limited")
    d = check(client, u, NEAR)
    codes = [analyse(client, u, d["id"], force="true").status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    r = analyse(client, u, d["id"])
    assert r.json()["error"]["code"] == "rate_limited" and "Retry-After" in r.headers


def test_disabled_stage_is_never_rate_limited(client, student, reference_corpus, ai_off, monkeypatch):
    monkeypatch.setenv("ORIGINALITY_AI_RATE_LIMIT_PER_MINUTE", "1"); reset_settings_cache()
    d = check(client, student, NEAR)
    assert [analyse(client, student, d["id"]).status_code for _ in range(3)] == [200, 200, 200]


def test_ready_reports_the_stage_without_key_material(client, ai_on):
    checks = client.get("/ready").json()["checks"]
    assert checks["originalityAI"] == {"status": "enabled", "model": "gemini-3.5-flash-lite"} and KEY not in client.get("/ready").text
