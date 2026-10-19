"""AI chat assistant — one streaming endpoint (Server-Sent Events), no persistence, no model tools.

Order of checks on POST /api/chat:  401 (token) → 403 (no profile) → 503 (assistant not enabled) → 429 (per-user limits) → 422 (body) → stream.
Failures after the stream has started cannot change the HTTP status, so they are sent as a final `error` event instead.

Conversations live in the browser only: this module stores nothing, and it logs sizes and outcomes, never message text.
The database connection used to build the student's context is closed BEFORE the first byte is streamed, so a slow model
never holds one of the pool's few connections.
"""
from __future__ import annotations

import json
import time
from contextlib import aclosing
from typing import AsyncIterator, Literal

import anyio
from fastapi import APIRouter, Depends
from pydantic import ConfigDict, Field, field_validator, model_validator
from starlette.responses import StreamingResponse
from starlette.types import Send

from ..core.config import get_settings
from ..core.errors import AppError, unavailable
from ..core.logging import get_logger, request_id_var
from ..core.middleware import limiter
from ..core.security import CurrentUser, require_student
from ..db.session import open_db
from ..integrations.anthropic_chat import ChatProvider, ChatProviderError, get_chat_provider
from ..schemas.common import ApiModel
from ..services import chat_context

router = APIRouter(prefix="/api/chat", tags=["chat"])
log = get_logger("chat")

MAX_MESSAGES, MAX_MESSAGE_CHARS, MAX_TOTAL_CHARS = 20, 2000, 12_000
_CONTROL = chat_context.CONTROL_CHARS
CONFIG = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)


class ChatMessage(ApiModel):
    model_config = CONFIG
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = _CONTROL.sub("", v).strip()
        if not v:
            raise ValueError("A message cannot be empty")
        return v


class ChatIn(ApiModel):
    """The whole conversation, resent each turn (the server keeps none). Only role + content: no user id, no system text, no tools."""
    model_config = CONFIG
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)

    @model_validator(mode="after")
    def _shape(self) -> "ChatIn":
        if self.messages[0].role != "user":
            raise ValueError("The conversation must start with a message from the student")
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the student")
        if sum(len(m.content) for m in self.messages) > MAX_TOTAL_CHARS:
            raise ValueError("This conversation is too long. Please start a new chat.")
        return self


def chat_gate(user: CurrentUser = Depends(require_student)) -> CurrentUser:
    """Any signed-in student (reviewers and admins included); the assistant must be on; per-user minute and day limits."""
    s = get_settings()
    if not s.chat_available:
        raise unavailable("The assistant is not available right now.")
    for key, limit, window in ((f"chat:{user.id}", s.chat_rate_limit_per_minute, 60), (f"chat-day:{user.id}", s.chat_daily_limit, 86400)):
        ok, retry = limiter.hit(key, limit, window)
        if not ok:
            log.warning("rate limited", extra={"event": "rate_limited", "path": "/api/chat"})
            raise AppError(429, "rate_limited", "You have used the assistant a lot. Please wait a bit and try again.",
                           {"retryAfterSeconds": retry}, headers={"Retry-After": str(retry)})
    return user


def sse(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}\n\n".encode()


async def event_stream(provider: ChatProvider, *, system: str, messages: list[dict], max_tokens: int, deadline_s: float, request_id: str) -> AsyncIterator[bytes]:
    """meta → delta* → done | error. Cancelled (client left) at any await: the `finally` still logs, and `aclosing` closes the provider stream."""
    started = time.monotonic()
    outcome, tokens_in, tokens_out, chars = "cancelled", None, None, 0
    max_chars = max_tokens * 8          # a defensive ceiling far above what max_tokens can produce
    try:
        yield sse("meta", {"requestId": request_id})
        async with aclosing(provider.stream(system=system, messages=messages, max_tokens=max_tokens)) as events:
            async for ev in events:
                if ev.type == "delta":
                    text = ev.text[:max_chars - chars]          # a single oversized chunk is cut to the budget too
                    chars += len(text)
                    yield sse("delta", {"text": text})
                    if chars >= max_chars:
                        outcome = "max_chars"
                        yield sse("done", {"stopReason": "max_tokens"})
                        return
                    if time.monotonic() - started > deadline_s:
                        raise ChatProviderError("timeout", "The assistant took too long to answer. Please try again.")
                else:
                    tokens_in, tokens_out = ev.input_tokens, ev.output_tokens
                    if ev.stop_reason == "refusal":
                        outcome = "declined"
                        yield sse("error", {"code": "declined", "message": "I can't help with that request.", "requestId": request_id})
                    else:
                        outcome = "ok"
                        yield sse("done", {"stopReason": ev.stop_reason or "end_turn"})
                    return
        outcome = "ok"                  # provider ended without a done event: still a clean end
        yield sse("done", {"stopReason": "end_turn"})
    except ChatProviderError as exc:
        outcome = exc.code
        yield sse("error", {"code": exc.code, "message": exc.message, "requestId": request_id})
    except Exception as exc:            # anything unexpected: log the class only (a provider message could contain anything), tell the student nothing internal
        outcome = "server_error"
        log.error("chat stream failed", extra={"event": "chat_stream_error", "code": type(exc).__name__})
        yield sse("error", {"code": "server_error", "message": "Something went wrong on our side. Please try again.", "requestId": request_id})
    finally:
        log.info("chat stream", extra={"event": "chat_stream", "status": outcome, "durationMs": round((time.monotonic() - started) * 1000, 1),
                                       "tokensIn": tokens_in, "tokensOut": tokens_out, "count": chars})


class SSEResponse(StreamingResponse):
    """Starlette notices a vanished client only when it next tries to send, and then abandons the body iterator.
    Close it explicitly — shielded, because this runs while being cancelled — so the upstream model request is released at once."""

    async def stream_response(self, send: Send) -> None:
        try:
            await super().stream_response(send)
        finally:
            close = getattr(self.body_iterator, "aclose", None)
            if close is not None:
                with anyio.CancelScope(shield=True):
                    await close()


@router.get("/status", summary="Is the assistant available? (the UI shows the launcher only when it is)")
def chat_status(user: CurrentUser = Depends(require_student)):
    s = get_settings()
    # `provider` is only a name for the UI's data-use disclosure (who receives the text); it is not a secret.
    return {"enabled": s.chat_available, "provider": s.chat_provider, "providerName": s.chat_provider_name}


@router.post("", summary="Ask the assistant — streams Server-Sent Events: meta, delta*, then done or error")
def chat(body: ChatIn, user: CurrentUser = Depends(chat_gate), provider: ChatProvider = Depends(get_chat_provider)):
    s = get_settings()
    # Sync endpoint → runs in the threadpool. The connection is the caller's own (role `authenticated`, RLS on) and is released before streaming.
    try:
        with open_db("authenticated", user.id, {"email": user.email}) as db:
            context = chat_context.build(db, user.id, body.messages[-1].content)
    except Exception as exc:
        log.error("chat context failed", extra={"event": "chat_context_error", "code": type(exc).__name__})
        raise unavailable("The assistant could not load your data. Please try again.")
    stream = event_stream(
        provider, system=chat_context.system_prompt(context), messages=[{"role": m.role, "content": m.content} for m in body.messages],
        max_tokens=s.chat_max_output_tokens, deadline_s=float(s.chat_timeout_seconds), request_id=request_id_var.get())
    return SSEResponse(stream, media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})
