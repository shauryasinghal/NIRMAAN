"""Log redaction must catch an Anthropic key however it shows up, without breaking the rules that already existed."""
import json
import logging

import pytest

from app.core.config import reset_settings_cache

from app.core.logging import JsonFormatter, RedactingFilter, redact

KEY = "sk-ant-api03-AbC_dEf-0123456789xyz"


@pytest.mark.parametrize("text", [
    f"key is {KEY} ok", f"ANTHROPIC_API_KEY={KEY}", f"x-api-key: {KEY}", f'{{"api_key": "{KEY}"}}', f"Authorization: Bearer {KEY}", f"anthropic_api_key = '{KEY}'",
    f"upstream said: invalid x-api-key {KEY[:16]}",
])
def test_anthropic_keys_are_redacted_everywhere(text):
    out = redact(text)
    assert "AbC_dEf" not in out and "0123456789xyz" not in out and "sk-ant-api03-AbC" not in out
    assert "REDACTED" in out


def test_existing_redactions_still_work():
    assert "REDACTED" in redact("password=hunter2") and "hunter2" not in redact("password=hunter2")
    assert "[REDACTED_JWT]" in redact("eyJhbGciOiJIUzI1NiJ9abcd.eyJzdWIiOiIxMjM0NTY3ODkwIn0abcd.sig")
    assert "pw123" not in redact("postgresql://user:pw123@host/db")
    assert redact("a normal sentence about hackathons") == "a normal sentence about hackathons"


def test_logging_pipeline_redacts_a_key_in_a_message_and_keeps_token_counts():
    rec = logging.LogRecord("t", logging.ERROR, __file__, 1, f"provider rejected {KEY}", None, None)
    rec.event, rec.tokensIn, rec.tokensOut = "chat_stream", 12, 34
    assert RedactingFilter().filter(rec)
    payload = json.loads(JsonFormatter().format(rec))
    assert KEY not in json.dumps(payload) and payload["tokensIn"] == 12 and payload["tokensOut"] == 34 and payload["event"] == "chat_stream"


GKEY = "AIzaSyFAKE-0123456789-abcdefghijklmnopqrs"      # obviously fake; same shape as a Google API key


@pytest.mark.parametrize("text", [
    f"key is {GKEY} ok", f"GEMINI_API_KEY={GKEY}", f"x-goog-api-key: {GKEY}", f"https://generativelanguage.googleapis.com/v1beta/models/m:streamGenerateContent?key={GKEY}&alt=sse",
    f'{{"api_key": "{GKEY}"}}', f"upstream said: API key not valid ({GKEY[:24]})",
])
def test_google_api_keys_are_redacted_everywhere(text):
    out = redact(text)
    assert "0123456789-abc" not in out and "klmnopqrs" not in out and "AIzaSyFAKE" not in out
    assert "REDACTED" in out


# ── keys of a format no pattern knows: the app redacts its OWN configured secrets by exact value ─────────────────────────────────
NEW_KEY = "AQ.FAKE-new_format.key_0123456789_abcdefXYZ"      # obviously fake, and deliberately NOT shaped like AIza…


@pytest.fixture()
def configured(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", NEW_KEY)
    reset_settings_cache()
    yield
    monkeypatch.undo(); reset_settings_cache()


@pytest.mark.parametrize("text", [
    f"the provider said the key {NEW_KEY} is not valid", f"{NEW_KEY}", f'{{"detail": "bad credential {NEW_KEY}"}}', f"GET https://example.test/v1/models?alt=sse&token={NEW_KEY}",
    f"{NEW_KEY}{NEW_KEY}", f"quoted '{NEW_KEY}' and again {NEW_KEY}",
])
def test_a_configured_key_is_removed_in_any_format_labelled_or_not(configured, text):
    out = redact(text)
    assert "AQ.FAKE" not in out and "0123456789_abc" not in out and "abcdefXYZ" not in out
    assert "REDACTED" in out


def test_a_configured_key_is_removed_from_formatted_messages_and_tracebacks(configured):
    rec = logging.LogRecord("t", logging.ERROR, __file__, 1, "provider rejected %s", (NEW_KEY,), None)
    assert RedactingFilter().filter(rec)
    try:
        raise RuntimeError(f"upstream: {NEW_KEY}")
    except RuntimeError:
        import sys
        err = logging.LogRecord("t", logging.ERROR, __file__, 1, "boom", None, sys.exc_info())
    payload = json.loads(JsonFormatter().format(err))
    assert NEW_KEY not in json.dumps(payload) and "AQ.FAKE" not in json.dumps(payload)
    assert NEW_KEY not in JsonFormatter().format(rec) and "AQ.FAKE" not in rec.getMessage()


def test_exact_value_matching_is_literal_not_a_regex(monkeypatch):
    weird = "a.b+c*d(1)[2]{3}|e\\f^$g"
    monkeypatch.setenv("GEMINI_API_KEY", weird); reset_settings_cache()
    try:
        assert redact(f"x {weird} y") == "x [REDACTED_SECRET] y"
        assert redact("a-b+c*d is similar but not the secret") == "a-b+c*d is similar but not the secret"
    finally:
        monkeypatch.undo(); reset_settings_cache()


def test_short_values_are_never_treated_as_secrets(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "short"); monkeypatch.setenv("GEMINI_API_KEY", "tiny"); reset_settings_cache()
    try:
        assert redact("a short and tiny text") == "a short and tiny text"
    finally:
        monkeypatch.undo(); reset_settings_cache()


def test_ordinary_text_is_untouched_when_a_key_is_configured(configured):
    for text in ("GET /api/opportunities?page=2&sort=fit 200", "request 7f3a91c2d5e84b60 finished in 12.5 ms", "student asked about hackathons", "turkey=1 monkey=2 key words"):
        assert redact(text) == text


@pytest.mark.parametrize("text,leaked", [
    ("https://host.test/path?alt=sse&key=ANYTHING-AT-ALL-123", "ANYTHING-AT-ALL-123"), ("https://host.test/path?key=ANYTHING-AT-ALL-123", "ANYTHING-AT-ALL-123"),
    ("params ;key=semi-colon-secret-9 end", "semi-colon-secret-9"), ("GET /x?a=1&KEY=UPPER-CASE-SECRET-1&b=2", "UPPER-CASE-SECRET-1"),
])
def test_key_query_parameters_are_redacted_whatever_the_value_looks_like(text, leaked):
    out = redact(text)
    assert leaked not in out and "key=[redacted]" in out.lower()


def test_only_real_key_parameters_are_matched():
    for text in ("turkey=1", "monkey=banana", "primary_key=id", "see key=value in the docs"):      # no ? & or ; in front of key=
        assert redact(text) == text


@pytest.mark.parametrize("text,leaked", [
    ("Authorization: Basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA"), ("authorization=raw-credential-value-77", "raw-credential-value-77"),
    ('{"Authorization": "Token abc123secretxyz"}', "abc123secretxyz"), ("Authorization: ApiKey some-opaque-value-5", "some-opaque-value-5"),
])
def test_non_bearer_authorization_headers_are_redacted(text, leaked):
    assert leaked not in redact(text)


def test_bearer_authorization_is_still_redacted_exactly_once():
    out = redact("Authorization: Bearer abc.def.ghi-secret")
    assert "abc.def.ghi-secret" not in out and out.count("REDACTED") == 1
