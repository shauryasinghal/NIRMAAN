"""The Gemini provider wrapper, against REAL google-genai types and a fake client: no key, no network, no charges."""
import asyncio
import logging
import sys

import httpx
import pytest

from app.core.config import reset_settings_cache
from app.core.errors import AppError
from app.integrations import anthropic_chat as ac, gemini_chat as gc
from tests.gemini_stub import PROVIDER_TEXT, api_error, chunk, install

KEY = "AIzaSyFAKE-FAKE-FAKE-FAKE-FAKE-FAKE-000"
MSGS = [{"role": "user", "content": "hi"}]


def make(model="gemini-3.5-flash-lite", timeout=30):
    return gc.GeminiChatProvider(KEY, model, timeout)


def run(provider, messages=MSGS, max_tokens=256, system="SYS"):
    async def go():
        return [e async for e in provider.stream(system=system, messages=messages, max_tokens=max_tokens)]
    return asyncio.run(go())


def fails(provider, **kw) -> ac.ChatProviderError:
    with pytest.raises(ac.ChatProviderError) as e:
        run(provider, **kw)
    return e.value


# ── the request ──────────────────────────────────────────────────────────────────────────────
def test_request_is_plain_text_chat_with_no_tools_and_an_explicit_key(monkeypatch):
    sdk = install(monkeypatch, [chunk("Hel"), chunk("lo", finish="STOP", usage=(5, 2, 1))])
    events = run(make(timeout=30))
    assert sdk.client_kwargs["api_key"] == KEY                                    # passed explicitly, never left to the SDK's env lookup
    assert sdk.client_kwargs["http_options"].timeout == 30_000                      # the SDK counts MILLISECONDS
    call = sdk.last
    assert call["model"] == "gemini-3.5-flash-lite"
    cfg = call["config"]
    assert cfg.system_instruction == "SYS" and cfg.max_output_tokens == 256
    for unset in ("tools", "tool_config", "thinking_config", "safety_settings", "temperature", "top_p", "top_k", "response_mime_type", "cached_content"):
        assert getattr(cfg, unset) is None, unset
    assert [e.type for e in events] == ["delta", "delta", "done"] and "".join(e.text for e in events) == "Hello"
    assert events[-1].stop_reason == "end_turn" and (events[-1].input_tokens, events[-1].output_tokens) == (5, 3)     # answer + thinking tokens


def test_roles_are_mapped_and_consecutive_turns_of_one_role_are_merged(monkeypatch):
    sdk = install(monkeypatch, [chunk("ok", finish="STOP")])
    run(make(), messages=[{"role": "user", "content": "one"}, {"role": "user", "content": "two"}, {"role": "assistant", "content": "A"}, {"role": "user", "content": "three"}])
    contents = sdk.last["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]                  # Gemini wants alternating turns
    assert [c.parts[0].text for c in contents] == ["one\n\ntwo", "A", "three"]


def test_empty_and_textless_chunks_are_skipped(monkeypatch):
    install(monkeypatch, [chunk(None, usage=(1, 0, 0)), chunk(""), chunk("x"), chunk(None, finish="STOP")])
    assert [e.text for e in run(make()) if e.type == "delta"] == ["x"]


@pytest.mark.parametrize("finish,expected", [("STOP", "end_turn"), ("MAX_TOKENS", "max_tokens"), (None, "end_turn"), ("OTHER", "end_turn")])
def test_normal_finish_reasons(monkeypatch, finish, expected):
    install(monkeypatch, [chunk("answer", finish=finish)])
    assert run(make())[-1].stop_reason == expected


@pytest.mark.parametrize("finish", ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "LANGUAGE"])
def test_blocked_content_is_reported_as_a_refusal(monkeypatch, finish):
    install(monkeypatch, [chunk("part", finish=finish)])
    assert run(make())[-1].stop_reason == "refusal"                                 # the router turns this into the existing 'declined' message


def test_a_blocked_prompt_is_a_refusal_even_with_no_candidates(monkeypatch):
    install(monkeypatch, [chunk(blocked=True)])
    assert run(make())[-1].stop_reason == "refusal"


def test_an_empty_answer_is_an_error_not_a_blank_reply(monkeypatch):
    install(monkeypatch, [chunk(None, finish="STOP", usage=(5, 0, 0))])
    assert fails(make()).code == "server_error"


# ── errors: our wording only, never Google's text ────────────────────────────────────────────
CODES = [(429, "provider_busy"), (503, "unavailable"), (500, "unavailable"), (401, "unavailable"), (403, "unavailable"), (404, "unavailable"),
         (400, "server_error"), (413, "server_error"), (504, "timeout"), (408, "timeout")]


@pytest.mark.parametrize("when", ["before the stream starts", "part-way through"])
@pytest.mark.parametrize("status,code", CODES)
def test_http_errors_map_to_safe_codes_and_leak_nothing(monkeypatch, caplog, status, code, when):
    caplog.set_level(logging.INFO)
    err = api_error(status)
    if when == "before the stream starts":
        install(monkeypatch, fail_on_call=err)
    else:
        install(monkeypatch, [chunk("partial"), err])
    got = fails(make())
    assert got.code == code
    shown = f"{got.message} {got!r} {got}"
    for leaked in ("SECRET-PROVIDER-TEXT", "AIza", "quota", str(status)):
        assert leaked not in shown
    assert got.__suppress_context__ is True
    logged = [r for r in caplog.records if getattr(r, "event", "") == "chat_provider_error"]
    assert len(logged) == 1 and logged[0].status == status and logged[0].source == "RESOURCE_EXHAUSTED"
    assert "SECRET-PROVIDER-TEXT" not in " ".join(f"{r.getMessage()} {r.__dict__}" for r in caplog.records)


def test_the_google_status_enum_is_sanitised_before_it_is_logged(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    install(monkeypatch, fail_on_call=api_error(429, 'RESOURCE_EXHAUSTED\n"} injected {json} 123 sk-ant-x'))
    fails(make())
    assert [r.source for r in caplog.records if getattr(r, "event", "") == "chat_provider_error"] == ["RESOURCE_EXHAUSTED"]         # only A-Z and _ survive


def test_network_timeouts_and_connection_failures(monkeypatch):
    install(monkeypatch, fail_on_call=httpx.ReadTimeout("slow"))
    assert fails(make()).code == "timeout"
    install(monkeypatch, [chunk("x"), httpx.ConnectError("refused")])
    assert fails(make()).code == "unavailable"


def test_httpx2_flavoured_failures_are_handled_too(monkeypatch):
    httpx2 = pytest.importorskip("httpx2")                                          # the SDK tolerates either library
    install(monkeypatch, fail_on_call=httpx2.ReadTimeout("slow"))
    assert fails(make()).code == "timeout"
    install(monkeypatch, fail_on_call=httpx2.ConnectError("refused"))
    assert fails(make()).code == "unavailable"


def test_closing_the_stream_early_releases_the_upstream_request(monkeypatch):
    sdk = install(monkeypatch, [chunk("a"), chunk("b"), chunk("c", finish="STOP")])

    async def go():
        gen = make().stream(system="S", messages=MSGS, max_tokens=64)
        assert (await gen.__anext__()).text == "a"
        await gen.aclose()                                                           # the student left
        return sdk.models.closed                                                     # checked at once, not at loop shutdown
    assert asyncio.run(go()) is True


def test_missing_sdk_is_a_clean_503(monkeypatch):
    import google
    monkeypatch.delattr(google, "genai", raising=False)
    for name in ("google.genai", "google.genai.errors", "google.genai.types"):
        monkeypatch.setitem(sys.modules, name, None)
    with pytest.raises(AppError) as e:
        make()
    assert e.value.status == 503


# ── choosing the provider ────────────────────────────────────────────────────────────────────
@pytest.fixture()
def fresh(monkeypatch):
    for k in ("CHAT_ENABLED", "CHAT_PROVIDER", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "CHAT_MODEL"):
        monkeypatch.delenv(k, raising=False)
    reset_settings_cache(); ac.reset_chat_provider()
    yield monkeypatch
    reset_settings_cache(); ac.reset_chat_provider()


def test_gemini_is_chosen_only_when_asked_for_and_uses_its_own_key_and_model(fresh):
    sdk = install(fresh)
    fresh.setenv("CHAT_ENABLED", "true"); fresh.setenv("CHAT_PROVIDER", "gemini"); fresh.setenv("GEMINI_API_KEY", KEY)
    fresh.setenv("ANTHROPIC_API_KEY", "sk-ant-should-not-be-used-000000")
    reset_settings_cache(); ac.reset_chat_provider()
    p = ac.get_chat_provider()
    assert isinstance(p, gc.GeminiChatProvider) and p is ac.get_chat_provider()
    assert sdk.client_kwargs["api_key"] == KEY and p._model == "gemini-3.5-flash-lite"


def test_anthropic_stays_the_default(fresh):
    made = {}

    class Sentinel:
        def __init__(self, **kw): made.update(kw)
    fresh.setattr(ac, "AnthropicChatProvider", Sentinel)
    fresh.setenv("CHAT_ENABLED", "true"); fresh.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key-000000"); fresh.setenv("GEMINI_API_KEY", KEY)
    reset_settings_cache(); ac.reset_chat_provider()
    assert isinstance(ac.get_chat_provider(), Sentinel) and made["api_key"] == "sk-ant-test-key-000000" and made["model"] == "claude-sonnet-5-5"
