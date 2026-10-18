"""Structured (JSON) logging with secret redaction and a per-request correlation id."""
from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
import time

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
user_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("user_id", default="-")

_REDACT = [
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{6,}"), "[REDACTED_API_KEY]"),               # an Anthropic key anywhere in text, with or without a "key=" label
    (re.compile(r"AIza[0-9A-Za-z_\-]{20,}"), "[REDACTED_API_KEY]"),                  # a Google (Gemini) API key anywhere in text, including in a ?key= URL
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]+"), r"\1[REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]*"), "[REDACTED_JWT]"),
    (re.compile(r"(?i)((?:access_token|refresh_token|id_token|client_secret|password|secret|api[_-]?key|code)[\"']?\s*[:=]\s*[\"']?)[^\s\"',&}]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(postgres(?:ql)?(?:\+\w+)?://[^:/\s]+:)[^@\s]+@"), r"\1[REDACTED]@"),
    (re.compile(r"(?i)([?&;]key=)[^\s&\"'#;]+"), r"\1[REDACTED]"),                      # a ?key=… / &key=… query parameter (Google APIs accept the key this way)
    (re.compile(r"(?i)(authorization[\"']?\s*[:=]\s*[\"']?)(?!bearer\b)[^\s\"',&}]+(?:\s+[^\s\"',&}]+)?"), r"\1[REDACTED]"),   # "Authorization: <scheme> <credential>" other than Bearer (handled above)
]


def _configured_secrets() -> list[str]:
    """The app's own secret values, so a leaked one is removed whatever it looks like. Never raises: logging must not break."""
    try:
        from .config import get_settings
        return get_settings().secret_values
    except Exception:
        return []


def redact(text: str) -> str:
    for secret in _configured_secrets():          # exact values first, before the patterns change the text's shape
        text = text.replace(secret, "[REDACTED_SECRET]")
    for pattern, repl in _REDACT:
        text = pattern.sub(repl, text)
    return text


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.msg = redact(record.getMessage())
            record.args = None
        except Exception:  # never break logging
            pass
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "requestId": request_id_var.get(),
            "userId": user_id_var.get(),
        }
        for key in ("event", "status", "method", "path", "durationMs", "code", "source", "count", "tokensIn", "tokensOut"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO", as_json: bool = True) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RedactingFilter())
    handler.setFormatter(JsonFormatter() if as_json else logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    for noisy in ("uvicorn.access", "httpx", "httpcore", "sentence_transformers", "urllib3", "filelock"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"nirmaan.{name}")
