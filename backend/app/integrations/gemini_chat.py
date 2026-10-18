"""Streaming chat completions from Google Gemini (official `google-genai` SDK) — called from the backend only.

Same rules as anthropic_chat.py, which defines the shared types (ChatProvider, ChatEvent, ChatProviderError) and the safe client messages:
  * the API key lives in settings (a SecretStr) and is handed to the SDK explicitly; the SDK's own GOOGLE_API_KEY / GEMINI_API_KEY lookup is never relied on
  * no tools, no web grounding, no thinking/safety overrides: the model can only talk, with each model's own defaults
  * every failure becomes a ChatProviderError with OUR wording. The SDK's exception text contains Google's response body, so only the numeric
    HTTP code and Google's status enum (letters and underscores only) are ever logged — never str(exc), never the details
  * the SDK is imported lazily, so the app and the tests run without it while chat is off or another provider is selected
"""
from __future__ import annotations

import re
from typing import AsyncIterator

from ..core.errors import unavailable
from ..core.logging import get_logger
from .anthropic_chat import REJECTED, TIMEOUT, UNAVAILABLE, ChatEvent, ChatProviderError, classify_status

log = get_logger("chat")

# Gemini finish reasons that mean "the model declined / the content was blocked" (the UI shows the existing 'declined' message).
REFUSAL_REASONS = frozenset({"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "LANGUAGE"})


def _transport_errors() -> tuple[tuple[type[BaseException], ...], tuple[type[BaseException], ...]]:
    """(timeout classes, other transport classes) for httpx, and for its fork httpx2 when installed (the SDK tolerates either)."""
    import httpx
    timeouts: list[type[BaseException]] = [httpx.TimeoutException]
    others: list[type[BaseException]] = [httpx.TransportError]
    try:
        import httpx2
        timeouts.append(httpx2.TimeoutException)
        others.append(httpx2.TransportError)
    except ImportError:
        pass
    return tuple(timeouts), tuple(others)


def to_contents(messages: list[dict], types) -> list:
    """Our {role: user|assistant} turns → Gemini Content objects (roles user|model). Consecutive turns of one role are merged, because
    Gemini wants them to alternate (a failed or stopped reply can leave two student messages in a row)."""
    turns: list[tuple[str, list[str]]] = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        if turns and turns[-1][0] == role:
            turns[-1][1].append(m["content"])
        else:
            turns.append((role, [m["content"]]))
    return [types.Content(role=role, parts=[types.Part(text="\n\n".join(texts))]) for role, texts in turns]


class GeminiChatProvider:
    def __init__(self, api_key: str, model: str, timeout: float):
        try:
            from google import genai
            from google.genai import errors, types
        except ImportError:
            log.error("google-genai SDK is not installed", extra={"event": "chat_sdk_missing"})
            raise unavailable("The assistant is not available right now.")
        self._errors, self._types, self._model = errors, types, model
        # The SDK's timeout is in MILLISECONDS. The router separately caps the wall-clock time of the whole answer.
        self._client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=int(float(timeout) * 1000)))

    async def stream(self, *, system: str, messages: list[dict], max_tokens: int) -> AsyncIterator[ChatEvent]:
        types = self._types
        timeout_errors, transport_errors = _transport_errors()
        emitted, finish, blocked, tokens_in, tokens_out = 0, None, False, None, None
        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=self._model, contents=to_contents(messages, types),
                config=types.GenerateContentConfig(system_instruction=system, max_output_tokens=max_tokens),
            )
            close = getattr(stream, "aclose", None)
            try:
                async for chunk in stream:
                    feedback = getattr(chunk, "prompt_feedback", None)
                    if feedback is not None and getattr(feedback, "block_reason", None):
                        blocked = True
                    candidates = chunk.candidates or []
                    if candidates and candidates[0].finish_reason is not None:
                        finish = candidates[0].finish_reason.name
                    usage = chunk.usage_metadata
                    if usage is not None:
                        tokens_in = usage.prompt_token_count
                        tokens_out = (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)
                    text = chunk.text
                    if text:
                        emitted += 1
                        yield ChatEvent("delta", text=text)
            finally:
                if close is not None:
                    await close()                      # the student left, or the answer ended: release the upstream request
        except self._errors.APIError as exc:
            status = exc.code if isinstance(exc.code, int) else 500
            code, message = UNAVAILABLE if status == 404 else classify_status(status)       # 404 = the model is not available to this key: an operator problem
            enum = re.sub(r"[^A-Z_]", "", str(exc.status or ""))[:40]                       # e.g. RESOURCE_EXHAUSTED — safe to log
            log.warning("provider error", extra={"event": "chat_provider_error", "status": status, "code": code, "source": enum})
            raise ChatProviderError(code, message) from None
        except timeout_errors:
            raise ChatProviderError(*TIMEOUT) from None
        except transport_errors:
            raise ChatProviderError(*UNAVAILABLE) from None
        if blocked or finish in REFUSAL_REASONS:
            yield ChatEvent("done", stop_reason="refusal", input_tokens=tokens_in, output_tokens=tokens_out)
        elif emitted == 0:
            raise ChatProviderError(*REJECTED)         # never show a blank reply as if it were an answer
        else:
            yield ChatEvent("done", stop_reason="max_tokens" if finish == "MAX_TOKENS" else "end_turn", input_tokens=tokens_in, output_tokens=tokens_out)
