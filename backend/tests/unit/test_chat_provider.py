"""The Anthropic provider wrapper, tested against a stand-in `anthropic` module so no SDK, key or network is needed.
The stand-in mirrors only what the wrapper touches (read from the anthropic 1.15.0 source): AsyncAnthropic(api_key, timeout, max_retries),
.messages.stream(...) as an async context manager exposing .text_stream and .get_final_message(), and the exception hierarchy
APIError ← APIConnectionError ← APITimeoutError, APIError ← APIStatusError(status_code)."""
import asyncio
import sys
import types

import pytest

from app.core.config import reset_settings_cache
from app.core.errors import AppError
from app.integrations import anthropic_chat as ac

PROVIDER_TEXT = "invalid x-api-key sk-ant-api03-LEAKED-0123456789 (request req_abc)"


def make_sdk(script, raises=None):
    """`raises` is a callable taking the stand-in module, so the exception is an instance of THAT module's classes."""
    m = types.ModuleType("anthropic")

    class APIError(Exception): ...
    class APIConnectionError(APIError): ...
    class APITimeoutError(APIConnectionError): ...
    class APIStatusError(APIError):
        def __init__(self, status): super().__init__(PROVIDER_TEXT); self.status_code = status

    class Stream:
        def __init__(self): self.text_stream = self._texts()
        async def _texts(self):
            for t in script:
                yield t
            if raises:
                raise raises(m)
        async def get_final_message(self):
            return types.SimpleNamespace(stop_reason="end_turn", usage=types.SimpleNamespace(input_tokens=11, output_tokens=3))

    class Manager:
        async def __aenter__(self): return Stream()
        async def __aexit__(self, *a): m.closed = True; return False

    class Messages:
        def stream(self, **kw): m.stream_kwargs = kw; return Manager()

    class AsyncAnthropic:
        def __init__(self, **kw): m.client_kwargs = kw; self.messages = Messages()

    m.APIError, m.APIConnectionError, m.APITimeoutError, m.APIStatusError, m.AsyncAnthropic = APIError, APIConnectionError, APITimeoutError, APIStatusError, AsyncAnthropic
    m.closed = False
    return m


@pytest.fixture()
def sdk(monkeypatch):
    def install(script=("Hel", "lo"), raises=None):
        m = make_sdk(script, raises)
        monkeypatch.setitem(sys.modules, "anthropic", m)
        return m
    return install


def run(provider, max_tokens=256):
    async def go():
        return [e async for e in provider.stream(system="SYS", messages=[{"role": "user", "content": "hi"}], max_tokens=max_tokens)]
    return asyncio.run(go())


def test_request_has_no_tools_no_prefill_and_low_effort(sdk):
    m = sdk()
    events = run(ac.AnthropicChatProvider("sk-ant-test-key-000000", "claude-sonnet-5-5", 30))
    assert m.client_kwargs == {"api_key": "sk-ant-test-key-000000", "timeout": 30.0, "max_retries": 1}
    assert m.stream_kwargs == {"model": "claude-sonnet-5-5", "max_tokens": 256, "system": "SYS", "messages": [{"role": "user", "content": "hi"}], "output_config": {"effort": "low"}}
    for forbidden in ("tools", "tool_choice", "thinking", "temperature", "top_p", "top_k", "betas", "fallbacks", "mcp_servers"):
        assert forbidden not in m.stream_kwargs
    assert [e.type for e in events] == ["delta", "delta", "done"] and "".join(e.text for e in events) == "Hello"
    assert events[-1].stop_reason == "end_turn" and (events[-1].input_tokens, events[-1].output_tokens) == (11, 3) and m.closed


def test_empty_text_deltas_are_skipped(sdk):
    sdk(script=("", "x", ""))
    assert [e.text for e in run(ac.AnthropicChatProvider("k", "m", 5)) if e.type == "delta"] == ["x"]


def test_missing_sdk_is_a_clean_503_not_a_crash(monkeypatch):
    monkeypatch.setitem(sys.modules, "anthropic", None)          # makes `import anthropic` raise ImportError
    with pytest.raises(AppError) as e:
        ac.AnthropicChatProvider("k", "m", 5)
    assert e.value.status == 503


def fails_with(sdk, make_exc):
    sdk(raises=make_exc)
    with pytest.raises(ac.ChatProviderError) as e:
        run(ac.AnthropicChatProvider("k", "m", 5))
    return e.value


@pytest.mark.parametrize("status,code", [(429, "provider_busy"), (529, "provider_busy"), (401, "unavailable"), (403, "unavailable"), (500, "unavailable"),
                                         (503, "unavailable"), (504, "timeout"), (408, "timeout"), (400, "server_error"), (404, "server_error"), (413, "server_error")])
def test_status_codes_map_to_safe_codes_and_never_forward_provider_text(sdk, status, code):
    err = fails_with(sdk, lambda m: m.APIStatusError(status))
    assert err.code == code
    shown = f"{err.message} {err!r} {err}"
    for leaked in ("sk-ant", "LEAKED", "x-api-key", "req_abc", str(status)):
        assert leaked not in shown
    assert err.__suppress_context__ is True


def test_timeout_is_matched_before_the_broader_connection_error(sdk):
    assert fails_with(sdk, lambda m: m.APITimeoutError("t")).code == "timeout"
    assert fails_with(sdk, lambda m: m.APIConnectionError("c")).code == "unavailable"


@pytest.mark.parametrize("status,expected", [(429, ac.BUSY), (529, ac.BUSY), (504, ac.TIMEOUT), (401, ac.UNAVAILABLE), (502, ac.UNAVAILABLE), (422, ac.REJECTED)])
def test_classify_status_is_pure(status, expected):
    assert ac.classify_status(status) == expected


def test_get_chat_provider_is_cached_and_resettable(monkeypatch, sdk):
    sdk()
    monkeypatch.setenv("CHAT_ENABLED", "true")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key-000000")
    reset_settings_cache(); ac.reset_chat_provider()
    try:
        first = ac.get_chat_provider()
        assert first is ac.get_chat_provider()
        ac.reset_chat_provider()
        assert ac.get_chat_provider() is not first
    finally:
        ac.reset_chat_provider(); reset_settings_cache()
