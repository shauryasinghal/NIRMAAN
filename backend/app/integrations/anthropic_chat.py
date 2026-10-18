"""Streaming chat completions from Anthropic Claude — called from the backend only.

Rules this module keeps:
  * the API key lives in settings (a SecretStr), is handed to the SDK once, and is never logged, returned or put in an error
  * the model gets NO tools and no web access (v1): it can only talk, so a prompt-injected listing cannot make it act
  * every failure is translated into a ChatProviderError carrying OUR wording; provider messages and bodies never reach a client or a log
  * the SDK is imported lazily, so the app (and every test that uses a fake provider) runs without it when chat is off
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Literal, Protocol

from ..core.config import get_settings
from ..core.errors import unavailable
from ..core.logging import get_logger

log = get_logger("chat")


class ChatProviderError(Exception):
    """A failure that is safe to show the student. `code` and `message` are ours, never the provider's text."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


@dataclass(frozen=True)
class ChatEvent:
    type: Literal["delta", "done"]
    text: str = ""
    stop_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


class ChatProvider(Protocol):
    def stream(self, *, system: str, messages: list[dict], max_tokens: int) -> AsyncIterator[ChatEvent]: ...


BUSY = ("provider_busy", "The assistant is busy right now. Please try again in a moment.")
UNAVAILABLE = ("unavailable", "The assistant is unavailable right now. Please try again later.")
TIMEOUT = ("timeout", "The assistant took too long to answer. Please try again.")
REJECTED = ("server_error", "The assistant could not answer that request.")


def classify_status(status: int) -> tuple[str, str]:
    """HTTP status from the provider → (code, message) for the client. Pure, so it is testable without the SDK."""
    if status in (429, 529):
        return BUSY
    if status in (408, 504):
        return TIMEOUT
    if status in (401, 403) or status >= 500:      # 401/403 = our key is wrong or revoked: an operator problem, not the student's
        return UNAVAILABLE
    return REJECTED


class AnthropicChatProvider:
    def __init__(self, api_key: str, model: str, timeout: float):
        try:
            import anthropic
        except ImportError:
            log.error("anthropic SDK is not installed", extra={"event": "chat_sdk_missing"})
            raise unavailable("The assistant is not available right now.")
        self._a = anthropic
        self._model = model
        # `timeout` is the per-read timeout; the router separately caps the wall-clock time of the whole answer.
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=float(timeout), max_retries=1)

    async def stream(self, *, system: str, messages: list[dict], max_tokens: int) -> AsyncIterator[ChatEvent]:
        a = self._a
        try:
            # No `tools`, no `thinking`/sampling overrides (adaptive thinking is the model's default), no prefill: the last turn is the student's.
            async with self._client.messages.stream(
                model=self._model, max_tokens=max_tokens, system=system, messages=messages, output_config={"effort": "low"},
            ) as stream:
                async for text in stream.text_stream:
                    if text:
                        yield ChatEvent("delta", text=text)
                final = await stream.get_final_message()
        except a.APITimeoutError:
            raise ChatProviderError(*TIMEOUT) from None
        except a.APIConnectionError:
            raise ChatProviderError(*UNAVAILABLE) from None
        except a.APIStatusError as exc:
            code, message = classify_status(exc.status_code)
            log.warning("provider error", extra={"event": "chat_provider_error", "status": exc.status_code, "code": code})   # status only — never the provider's message
            raise ChatProviderError(code, message) from None
        yield ChatEvent("done", stop_reason=final.stop_reason,
                        input_tokens=getattr(final.usage, "input_tokens", None), output_tokens=getattr(final.usage, "output_tokens", None))


_provider: ChatProvider | None = None


def get_chat_provider() -> ChatProvider:
    """FastAPI dependency. One client per process; tests replace it through `app.dependency_overrides`.
    Lives in this module (which also holds the shared provider types) so no existing import changes; CHAT_PROVIDER picks the vendor."""
    global _provider
    if _provider is None:
        s = get_settings()
        if s.chat_provider == "gemini":
            from .gemini_chat import GeminiChatProvider
            _provider = GeminiChatProvider(api_key=s.gemini_api_key.get_secret_value(), model=s.gemini_model, timeout=s.chat_timeout_seconds)
        else:
            _provider = AnthropicChatProvider(api_key=s.anthropic_api_key.get_secret_value(), model=s.chat_model, timeout=s.chat_timeout_seconds)
    return _provider


def reset_chat_provider() -> None:   # used by tests
    global _provider
    _provider = None
