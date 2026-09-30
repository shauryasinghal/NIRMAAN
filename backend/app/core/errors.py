"""One error contract for the whole API:

    {"error": {"code": "not_found", "message": "...", "details": <optional>, "requestId": "..."}}

Codes: validation_error, bad_request, unauthorized, forbidden, not_found, conflict, rate_limited,
payload_too_large, unsupported_media_type, service_unavailable, server_error.
Stack traces and internals never reach the client — they go to the structured log.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .logging import get_logger, request_id_var

log = get_logger("errors")

_CODE_FOR_STATUS = {
    400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "bad_request",
    409: "conflict", 413: "payload_too_large", 415: "unsupported_media_type", 422: "validation_error",
    429: "rate_limited", 503: "service_unavailable",
}


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None, headers: dict | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details, self.headers = status, code, message, details, headers or {}


def bad_request(msg: str, details: Any = None) -> AppError: return AppError(400, "bad_request", msg, details)
def unauthorized(msg: str = "Authentication required") -> AppError:
    return AppError(401, "unauthorized", msg, headers={"WWW-Authenticate": "Bearer"})
def forbidden(msg: str = "You do not have permission to do that") -> AppError: return AppError(403, "forbidden", msg)
def not_found(what: str = "Resource") -> AppError: return AppError(404, "not_found", f"{what} not found")
def conflict(msg: str, details: Any = None) -> AppError: return AppError(409, "conflict", msg, details)
def unavailable(msg: str, details: Any = None) -> AppError: return AppError(503, "service_unavailable", msg, details)


def body(code: str, message: str, details: Any = None) -> dict:
    err: dict[str, Any] = {"code": code, "message": message, "requestId": request_id_var.get()}
    if details is not None:
        err["details"] = details
    return {"error": err}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(body(exc.code, exc.message, exc.details), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"], "type": e["type"]} for e in exc.errors()]
        return JSONResponse(body("validation_error", "The request was invalid", {"fields": fields}), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = _CODE_FOR_STATUS.get(exc.status_code, "server_error" if exc.status_code >= 500 else "bad_request")
        msg = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return JSONResponse(body(code, msg), status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error", extra={"event": "unhandled_exception", "path": request.url.path, "method": request.method})
        return JSONResponse(body("server_error", "Something went wrong on our side. Please try again."), status_code=500)
