"""Structured (JSON-schema constrained) analysis from Google Gemini for the originality checker — called from the backend only.

Same rules as gemini_chat.py:
  * the API key lives in settings (a SecretStr) and is handed to the SDK explicitly; the SDK's own GOOGLE_API_KEY / GEMINI_API_KEY lookup is never relied on
  * no tools, no grounding, no safety overrides: the model can only return one JSON document that matches the schema it was given
  * every failure becomes an OriginalityAIError with OUR code and wording. The SDK's exception text contains Google's response body, so only the
    numeric HTTP code and Google's status enum (letters and underscores only) are ever logged — never str(exc), never the details
  * the SDK is imported lazily, so the app and the tests run without it while the feature is off

Reliability: one synchronous request per attempt with the SDK timeout; 429, 5xx, timeouts, transport errors and unparseable output are retried
with exponential backoff (attempts are configurable); key / permission / model errors are not retried — they are an operator problem.
"""
from __future__ import annotations

import json
import random
import re
import time
from dataclasses import dataclass
from typing import Callable

from pydantic import BaseModel, ValidationError

from ..core.logging import get_logger

log = get_logger("originality_ai")

REFUSAL_REASONS = frozenset({"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "LANGUAGE"})
BACKOFF_BASE, BACKOFF_MAX = 0.6, 8.0

# Safe, student-facing messages — the only text about a failure that ever leaves the server.
MESSAGES = {
    "not_configured": "Deep AI analysis is not enabled on this server.",
    "invalid_key": "Deep AI analysis is not configured correctly on this server, so it could not run.",
    "model_unavailable": "The configured AI model is not available to this server, so deep analysis could not run.",
    "busy": "The AI analysis service is busy right now. Please try again in a moment.",
    "timeout": "The AI analysis took too long and was stopped.",
    "unavailable": "The AI analysis service is unavailable right now. Please try again later.",
    "blocked": "The AI service declined to analyse this text.",
    "malformed": "The AI service returned an analysis that could not be read, so it was discarded.",
    "rejected": "The AI service could not process this request.",
}
RETRYABLE = frozenset({"busy", "timeout", "unavailable", "malformed"})


class OriginalityAIError(Exception):
    """A failure that is safe to show the student. `code` and `message` are ours, never the provider's text."""

    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or MESSAGES.get(code, MESSAGES["unavailable"]))
        self.code, self.message = code, message or MESSAGES.get(code, MESSAGES["unavailable"])

    @property
    def retryable(self) -> bool:
        return self.code in RETRYABLE


def classify_status(status: int) -> str:
    """HTTP status from the provider → our error code. Pure, so it is testable without the SDK."""
    if status in (429, 529):
        return "busy"
    if status in (408, 504):
        return "timeout"
    if status in (401, 403):          # our key is wrong, revoked or not permitted: an operator problem, not the student's
        return "invalid_key"
    if status == 404:                 # the model is not available to this key / project
        return "model_unavailable"
    if status >= 500:
        return "unavailable"
    return "rejected"


@dataclass(frozen=True)
class AIResult:
    data: BaseModel                   # the validated wire report
    attempts: int
    duration_ms: float
    input_tokens: int | None
    output_tokens: int | None
    finish_reason: str | None


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


def backoff_delay(attempt: int, rng: Callable[[], float] = random.random) -> float:
    """Seconds to wait before retry number `attempt` (1 = first retry): exponential, capped, with jitter so parallel requests spread out."""
    return min(BACKOFF_MAX, BACKOFF_BASE * (2 ** (attempt - 1))) * (0.75 + 0.5 * rng())


class GeminiOriginalityClient:
    """One client per process. `sleep` is injectable so tests do not wait for the backoff."""

    def __init__(self, api_key: str, model: str, timeout_seconds: float, max_output_tokens: int, attempts: int = 3, sleep: Callable[[float], None] = time.sleep):
        try:
            from google import genai
            from google.genai import errors, types
        except ImportError:
            log.error("google-genai SDK is not installed", extra={"event": "originality_ai_sdk_missing"})
            raise OriginalityAIError("not_configured")
        self._errors, self._types, self.model = errors, types, model
        self._max_output_tokens, self.attempts, self._sleep = max_output_tokens, max(1, attempts), sleep
        # The SDK's timeout is in MILLISECONDS. No SDK-level retries: the loop below is the only retry policy, so attempts are predictable.
        self._client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=int(float(timeout_seconds) * 1000)))

    def analyse(self, *, system: str, prompt: str, schema: type[BaseModel]) -> AIResult:
        started = time.monotonic()
        last: OriginalityAIError | None = None
        for attempt in range(1, self.attempts + 1):
            try:
                return self._once(system, prompt, schema, attempt, started)
            except OriginalityAIError as exc:
                last = exc
                if not exc.retryable or attempt >= self.attempts:
                    raise
                delay = backoff_delay(attempt)
                log.info("retrying deep analysis", extra={"event": "originality_ai_retry", "code": exc.code, "count": attempt, "durationMs": round(delay * 1000)})
                self._sleep(delay)
        raise last or OriginalityAIError("unavailable")      # unreachable in practice; keeps the type checker honest

    def _once(self, system: str, prompt: str, schema: type[BaseModel], attempt: int, started: float) -> AIResult:
        types = self._types
        timeout_errors, transport_errors = _transport_errors()
        try:
            response = self._client.models.generate_content(
                model=self.model, contents=prompt,
                config=types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json", response_schema=schema,
                                                   temperature=0.2, max_output_tokens=self._max_output_tokens),
            )
        except self._errors.APIError as exc:
            status = exc.code if isinstance(exc.code, int) else 500
            code = classify_status(status)
            enum = re.sub(r"[^A-Z_]", "", str(exc.status or ""))[:40]                       # e.g. RESOURCE_EXHAUSTED — safe to log
            log.warning("provider error", extra={"event": "originality_ai_error", "status": status, "code": code, "source": enum, "count": attempt})
            raise OriginalityAIError(code) from None
        except timeout_errors:
            log.warning("provider timeout", extra={"event": "originality_ai_error", "code": "timeout", "count": attempt})
            raise OriginalityAIError("timeout") from None
        except transport_errors:
            log.warning("provider unreachable", extra={"event": "originality_ai_error", "code": "unavailable", "count": attempt})
            raise OriginalityAIError("unavailable") from None

        feedback = getattr(response, "prompt_feedback", None)
        if feedback is not None and getattr(feedback, "block_reason", None):
            raise OriginalityAIError("blocked")
        candidates = response.candidates or []
        finish = candidates[0].finish_reason.name if candidates and candidates[0].finish_reason is not None else None
        if finish in REFUSAL_REASONS:
            raise OriginalityAIError("blocked")
        usage = getattr(response, "usage_metadata", None)
        tokens_in = getattr(usage, "prompt_token_count", None) if usage is not None else None
        tokens_out = ((usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)) if usage is not None else None

        text = response.text
        if not text or not text.strip():
            log.warning("empty analysis", extra={"event": "originality_ai_error", "code": "malformed", "source": finish or "", "count": attempt})
            raise OriginalityAIError("malformed")
        try:
            data = schema.model_validate(json.loads(text))
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
            # a truncated document (MAX_TOKENS) or a schema violation: logged by class only — the text could contain anything
            log.warning("unparseable analysis", extra={"event": "originality_ai_error", "code": "malformed", "source": finish or type(exc).__name__, "count": attempt})
            raise OriginalityAIError("malformed") from None
        return AIResult(data=data, attempts=attempt, duration_ms=round((time.monotonic() - started) * 1000, 1), input_tokens=tokens_in, output_tokens=tokens_out, finish_reason=finish)


_client: GeminiOriginalityClient | None = None


def get_client() -> GeminiOriginalityClient:
    """One client per process; tests replace it with `set_client`. Raises OriginalityAIError('not_configured') when the feature is off."""
    global _client
    if _client is None:
        from ..core.config import get_settings
        s = get_settings()
        if not s.originality_ai_available:
            raise OriginalityAIError("not_configured")
        _client = GeminiOriginalityClient(api_key=s.gemini_api_key.get_secret_value(), model=s.originality_ai_model, timeout_seconds=s.originality_ai_timeout_seconds,
                                          max_output_tokens=s.originality_ai_max_output_tokens, attempts=s.originality_ai_attempts)
    return _client


def set_client(client: GeminiOriginalityClient | None) -> None:   # tests / alternative backends
    global _client
    _client = client
