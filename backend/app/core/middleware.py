"""Request context (correlation id), access log, security headers, size limit, rate limiting."""
from __future__ import annotations

import re
import threading
import time
import uuid
from collections import deque

from fastapi import Depends, Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import get_settings
from .errors import AppError, body
from .logging import get_logger, request_id_var, user_id_var

log = get_logger("http")
_RID = re.compile(r"^[A-Za-z0-9\-]{8,64}$")
_SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cache-control", b"no-store"),
]


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
        rid = headers.get("x-request-id", "")
        rid = rid if _RID.match(rid) else uuid.uuid4().hex
        request_id_var.set(rid)
        user_id_var.set("-")
        start, status_holder = time.perf_counter(), {"status": 500}

        limit = get_settings().max_request_bytes
        cl = headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > limit:
            payload = __import__("json").dumps(body("payload_too_large", "The request body is too large")).encode()
            await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"x-request-id", rid.encode())]})
            await send({"type": "http.response.body", "body": payload})
            return

        async def send_wrapper(message: Message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                hdrs = list(message.get("headers", []))
                present = {k.lower() for k, _ in hdrs}
                hdrs.append((b"x-request-id", rid.encode()))
                hdrs += [h for h in _SECURITY_HEADERS if h[0] not in present]
                message["headers"] = hdrs
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope.get("path", "")
            if path not in ("/health", "/ready"):
                log.info("request", extra={
                    "event": "http_request", "method": scope.get("method"), "path": path,
                    "status": status_holder["status"], "durationMs": round((time.perf_counter() - start) * 1000, 1)})


class SlidingWindowLimiter:
    """In-process sliding window. Fine for one instance; swap `hit` for Redis when scaling out."""

    def __init__(self):
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window: float) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False, max(1, int(window - (now - q[0])))
            q.append(now)
            if len(self._hits) > 20_000:
                self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] <= window}
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?"))


def rate_limit(name: str, limit: int, window: int = 60):
    """Per-user (falls back to per-IP) limit for expensive routes: Depends(rate_limit('originality', 10))."""
    def dep(request: Request):
        who = getattr(getattr(request.state, "user", None), "id", None) or client_ip(request)
        ok, retry = limiter.hit(f"{name}:{who}", limit, window)
        if not ok:
            log.warning("rate limited", extra={"event": "rate_limited", "path": request.url.path})
            raise AppError(429, "rate_limited", "Too many requests. Please slow down.", {"retryAfterSeconds": retry}, headers={"Retry-After": str(retry)})
    return dep


class GlobalRateLimitMiddleware:
    """Coarse per-IP ceiling for every request; route-level limits above are tighter."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http" and scope.get("path") not in ("/health", "/ready"):
            headers = {k.decode().lower(): v.decode() for k, v in scope["headers"]}
            fwd = headers.get("x-forwarded-for")
            ip = fwd.split(",")[0].strip() if fwd else (scope.get("client") or ("?",))[0]
            ok, retry = limiter.hit(f"global:{ip}", get_settings().rate_limit_per_minute, 60)
            if not ok:
                payload = __import__("json").dumps(body("rate_limited", "Too many requests. Please slow down.", {"retryAfterSeconds": retry})).encode()
                await send({"type": "http.response.start", "status": 429, "headers": [(b"content-type", b"application/json"), (b"retry-after", str(retry).encode())]})
                await send({"type": "http.response.body", "body": payload})
                return
        await self.app(scope, receive, send)
