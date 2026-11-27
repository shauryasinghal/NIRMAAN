"""The Gemini deep-analysis client, against REAL google-genai types and a fake client: no key, no network, no charges."""
import json
import logging

import httpx
import pytest

from app.integrations import gemini_originality as go
from app.schemas.originality import GeminiReportWire
from tests.gemini_stub import PROVIDER_TEXT, api_error, install_sync, json_response

KEY = "AIzaSyFAKE-FAKE-FAKE-FAKE-FAKE-FAKE-000"


def dim(level="moderate", text="Both describe a booking flow."):
    return {"level": level, "explanation": text}


def wire_report(keys=("m1",), **over):
    base = {"overall_summary": "Both ideas address lab bookings; the submission adds waitlists.",
            "matches": [{"match_id": k, "relationship": "similar_problem_different_solution", "problem_similarity": dim("high"), "solution_similarity": dim(),
                         "functional_similarity": dim(), "target_user_similarity": dim("high"), "technical_approach_similarity": dim("low"),
                         "common_features": ["slot booking"], "unique_to_submission": ["waitlist"], "meaningful_differences": ["mobile-first"], "potentially_reused_concepts": [],
                         "summary": "Same problem, different approach."} for k in keys],
            "unique_contributions": ["waitlist"], "potential_overlap_areas": ["slot booking"], "missing_differentiators": ["who the admins are"],
            "suggestions": [{"kind": "new_feature", "suggestion": "Add fairness rules.", "rationale": "None of the matches mention them."}],
            "confidence": "medium", "limitations": ["Only short descriptions were available."]}
    base.update(over)
    return base


def make(attempts=3, sleeps=None):
    return go.GeminiOriginalityClient(KEY, "gemini-3.5-flash-lite", timeout_seconds=45, max_output_tokens=4096, attempts=attempts,
                                      sleep=(sleeps.append if sleeps is not None else (lambda s: None)))


def analyse(client):
    return client.analyse(system="SYS", prompt="PROMPT", schema=GeminiReportWire)


def fails(client) -> go.OriginalityAIError:
    with pytest.raises(go.OriginalityAIError) as e:
        analyse(client)
    return e.value


# ── the request ──────────────────────────────────────────────────────────────────────────────
def test_request_is_schema_constrained_json_with_no_tools_and_an_explicit_key(monkeypatch):
    sdk = install_sync(monkeypatch, [json_response(wire_report())])
    res = analyse(make())
    assert sdk.client_kwargs["api_key"] == KEY                                       # passed explicitly, never left to the SDK's env lookup
    assert sdk.client_kwargs["http_options"].timeout == 45_000                      # the SDK counts MILLISECONDS
    assert sdk.client_kwargs["http_options"].retry_options is None                  # our loop is the only retry policy
    call = sdk.last
    assert call["model"] == "gemini-3.5-flash-lite" and call["contents"] == "PROMPT"
    cfg = call["config"]
    assert cfg.system_instruction == "SYS" and cfg.response_mime_type == "application/json" and cfg.response_schema is GeminiReportWire
    assert cfg.max_output_tokens == 4096 and cfg.temperature == 0.2
    for unset in ("tools", "tool_config", "safety_settings", "cached_content", "thinking_config"):
        assert getattr(cfg, unset) is None, unset
    assert isinstance(res.data, GeminiReportWire) and res.data.matches[0].match_id == "m1"
    assert res.attempts == 1 and (res.input_tokens, res.output_tokens) == (120, 300) and res.finish_reason == "STOP"


# ── provider failures → our codes, our wording, nothing of Google's ──────────────────────────
@pytest.mark.parametrize("status,code", [(401, "invalid_key"), (403, "invalid_key"), (404, "model_unavailable"), (400, "rejected")])
def test_key_model_and_request_errors_are_not_retried(monkeypatch, status, code, caplog):
    sdk = install_sync(monkeypatch, [api_error(status, "PERMISSION_DENIED")])
    with caplog.at_level(logging.WARNING):
        err = fails(make())
    assert err.code == code and err.message == go.MESSAGES[code] and len(sdk.models.calls) == 1
    assert PROVIDER_TEXT not in err.message and "AIzaSy" not in err.message
    assert all(PROVIDER_TEXT not in r.getMessage() and "AIzaSyFAKE" not in str(r.__dict__) for r in caplog.records)


def test_busy_and_server_errors_are_retried_with_backoff_then_reported(monkeypatch):
    sleeps: list[float] = []
    sdk = install_sync(monkeypatch, [api_error(429), api_error(503, "UNAVAILABLE"), api_error(500, "INTERNAL")])
    err = fails(make(attempts=3, sleeps=sleeps))
    assert err.code == "unavailable" and len(sdk.models.calls) == 3
    assert len(sleeps) == 2 and sleeps[0] < sleeps[1] <= go.BACKOFF_MAX and all(s > 0 for s in sleeps)       # exponential, capped


def test_a_retry_can_succeed(monkeypatch):
    sdk = install_sync(monkeypatch, [api_error(429), json_response(wire_report())])
    res = analyse(make(sleeps=[]))
    assert res.attempts == 2 and len(sdk.models.calls) == 2 and res.data.confidence == "medium"


def test_timeout_is_retried_then_reported_as_timeout(monkeypatch):
    sdk = install_sync(monkeypatch, [httpx.ReadTimeout("slow")])
    err = fails(make(attempts=2, sleeps=[]))
    assert err.code == "timeout" and err.message == go.MESSAGES["timeout"] and len(sdk.models.calls) == 2


def test_transport_error_is_unavailable(monkeypatch):
    install_sync(monkeypatch, [httpx.ConnectError("dns")])
    assert fails(make(attempts=1)).code == "unavailable"


def test_single_attempt_setting_means_no_retry(monkeypatch):
    sdk = install_sync(monkeypatch, [api_error(429)])
    assert fails(make(attempts=1)).code == "busy" and len(sdk.models.calls) == 1


# ── malformed output ─────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("payload", ['{"overall_summary": "unterminated', '{"overall_summary": "x"}', '[]', json.dumps({**wire_report(), "confidence": "certain"}), ""])
def test_malformed_or_schema_violating_output_is_discarded_and_retried(monkeypatch, payload):
    sdk = install_sync(monkeypatch, [json_response(payload)])
    err = fails(make(attempts=2, sleeps=[]))
    assert err.code == "malformed" and err.message == go.MESSAGES["malformed"] and len(sdk.models.calls) == 2


def test_truncated_document_is_malformed(monkeypatch):
    install_sync(monkeypatch, [json_response('{"overall_summary": "the model ran out of', finish="MAX_TOKENS")])
    assert fails(make(attempts=1)).code == "malformed"


def test_blocked_prompt_or_refused_answer_is_not_retried(monkeypatch):
    from tests.gemini_stub import chunk
    sdk = install_sync(monkeypatch, [chunk(blocked=True)])
    assert fails(make()).code == "blocked" and len(sdk.models.calls) == 1
    sdk = install_sync(monkeypatch, [chunk(None, finish="SAFETY")])
    assert fails(make()).code == "blocked" and len(sdk.models.calls) == 1


# ── pure helpers ─────────────────────────────────────────────────────────────────────────────
def test_status_classification():
    assert [go.classify_status(s) for s in (429, 529, 408, 504, 401, 403, 404, 500, 503, 400, 422)] == \
           ["busy", "busy", "timeout", "timeout", "invalid_key", "invalid_key", "model_unavailable", "unavailable", "unavailable", "rejected", "rejected"]
    assert go.OriginalityAIError("busy").retryable and go.OriginalityAIError("malformed").retryable and not go.OriginalityAIError("invalid_key").retryable


def test_backoff_grows_and_is_capped():
    delays = [go.backoff_delay(n, rng=lambda: 0.5) for n in range(1, 8)]
    assert delays == sorted(delays) and delays[-1] == go.BACKOFF_MAX and delays[0] == go.BACKOFF_BASE


def test_get_client_refuses_when_the_feature_is_off(monkeypatch):
    from app.core.config import reset_settings_cache
    monkeypatch.setenv("ORIGINALITY_AI_ENABLED", "false"); monkeypatch.setenv("GEMINI_API_KEY", KEY)
    reset_settings_cache(); go.set_client(None)
    try:
        assert fails_get().code == "not_configured"
        monkeypatch.setenv("ORIGINALITY_AI_ENABLED", "true"); monkeypatch.setenv("GEMINI_API_KEY", "")
        reset_settings_cache()
        assert fails_get().code == "not_configured"           # switched on without a key is still off — never half-enabled
    finally:
        reset_settings_cache(); go.set_client(None)


def fails_get():
    with pytest.raises(go.OriginalityAIError) as e:
        go.get_client()
    return e.value
