"""Authentication & authorization.

Supabase Auth issues the tokens. This module only *verifies* them and then derives identity and role
from the database — never from anything the client sent:

  * algorithm allow-list per key type (no `none`, no alg confusion)
  * `aud` = authenticated, `exp` + `sub` required, `iss` checked when SUPABASE_URL is set
  * anon / service_role keys are not user tokens and are rejected (no `sub`)
  * optional session-revocation check against auth.sessions
  * role comes from public.profiles.role (protected by trigger + admin-only RPC)
"""
from __future__ import annotations

import ssl
import time
from dataclasses import dataclass
from enum import IntEnum
from typing import Iterator

import certifi
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .config import get_settings
from .errors import forbidden, unauthorized, unavailable
from .logging import get_logger, user_id_var
from ..db.session import Db, open_db

log = get_logger("auth")
_bearer = HTTPBearer(auto_error=False, description="Supabase access token (JWT)")


class Role(IntEnum):
    student = 1
    reviewer = 2
    admin = 3

    @classmethod
    def parse(cls, value: str) -> "Role":
        return cls[value]


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    full_name: str
    role: Role
    session_id: str | None = None

    @property
    def is_reviewer(self) -> bool: return self.role >= Role.reviewer
    @property
    def is_admin(self) -> bool: return self.role >= Role.admin


# ── token verification ───────────────────────────────────────────────────────────────────────
_jwks_clients: dict[str, PyJWKClient] = {}


def _ssl_context() -> ssl.SSLContext:
    """PyJWKClient downloads the signing keys with urllib, which trusts only the operating system's CA store. Some Python builds
    (e.g. python.org's macOS installer) ship with none, so the fetch died with CERTIFICATE_VERIFY_FAILED and EVERY real Supabase
    token was answered "Invalid or expired token". certifi's bundle is what httpx already uses everywhere else in this API."""
    return ssl.create_default_context(cafile=certifi.where())


def _jwks(url: str) -> PyJWKClient:
    if url not in _jwks_clients:
        _jwks_clients[url] = PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5, ssl_context=_ssl_context())
    return _jwks_clients[url]


def verify_token(token: str) -> dict:
    s = get_settings()
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "")
        issuer = f"{s.supabase_url.rstrip('/')}/auth/v1" if s.supabase_url else None
        if alg == "HS256":
            if not s.supabase_jwt_secret:
                raise unauthorized("Invalid or expired token")
            key, algs = s.supabase_jwt_secret, ["HS256"]
        elif alg in ("ES256", "RS256", "EdDSA") and s.supabase_url:
            key = _jwks(f"{s.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json").get_signing_key_from_jwt(token).key
            algs = [alg]
        else:
            raise unauthorized("Invalid or expired token")
        claims = jwt.decode(
            token, key, algorithms=algs, audience=s.supabase_jwt_audience, issuer=issuer,
            options={"require": ["exp", "sub", "aud"], "verify_iss": issuer is not None}, leeway=10,
        )
    except jwt.ExpiredSignatureError:
        raise unauthorized("Your session has expired. Please sign in again.")
    except jwt.PyJWKClientConnectionError as exc:
        # We could not reach the key store, so we cannot say anything about the token. That is OUR outage, not a bad token:
        # still fail closed, but as 503 (the client must not refresh-and-retry or sign the user out over it).
        log.error("signing keys unavailable", extra={"event": "auth_jwks_unavailable", "code": type(exc).__name__})
        raise unavailable("Sign-in verification is temporarily unavailable. Please try again in a moment.")
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        log.warning("token rejected", extra={"event": "auth_token_rejected", "code": type(exc).__name__})   # class only — never the token
        raise unauthorized("Invalid or expired token")
    if claims.get("role") != "authenticated":
        raise unauthorized("Invalid or expired token")
    return claims


_session_cache: dict[str, tuple[float, bool]] = {}


def _session_active(db: Db, session_id: str, user_id: str) -> bool:
    key = f"{session_id}:{user_id}"
    hit = _session_cache.get(key)
    now = time.monotonic()
    if hit and now - hit[0] < get_settings().session_cache_seconds:
        return hit[1]
    ok = bool(db.val("select private.session_is_active(cast(:s as uuid), cast(:u as uuid))", s=session_id, u=user_id))
    if len(_session_cache) > 5000:
        _session_cache.clear()
    _session_cache[key] = (now, ok)
    return ok


def clear_auth_caches() -> None:
    _session_cache.clear()


# ── dependencies ─────────────────────────────────────────────────────────────────────────────
def get_current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> CurrentUser:
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise unauthorized()
    claims = verify_token(creds.credentials)
    uid, sid = str(claims["sub"]), claims.get("session_id")
    with open_db("service_role", uid) as db:
        if get_settings().session_check and sid and not _session_active(db, str(sid), uid):
            raise unauthorized("This session has ended. Please sign in again.")
        row = db.one("select id::text as id, email, full_name, role::text as role from public.profiles where id = cast(:u as uuid)", u=uid)
    if row is None:
        # Valid Supabase identity but no profile row: never guess a role.
        raise forbidden("Your profile is not ready yet. Please try again in a moment.")
    user = CurrentUser(id=row["id"], email=row["email"], full_name=row["full_name"], role=Role.parse(row["role"]), session_id=str(sid) if sid else None)
    request.state.user = user
    user_id_var.set(user.id)
    return user


def _require(min_role: Role):
    def dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role < min_role:
            log.warning("forbidden", extra={"event": "authz_denied", "code": min_role.name})
            raise forbidden(f"{min_role.name.capitalize()} access required" if min_role > Role.student else "Access denied")
        return user
    return dep


# Roles are hierarchical: admin ⊃ reviewer ⊃ student. Every signed-in profile is at least a student.
require_student = _require(Role.student)
require_reviewer = _require(Role.reviewer)
require_admin = _require(Role.admin)


def get_db(user: CurrentUser = Depends(require_student)) -> Iterator[Db]:
    """Request-scoped, RLS-enforced connection acting as the verified user."""
    with open_db("authenticated", user.id, {"email": user.email}) as db:
        yield db


def get_db_reviewer(user: CurrentUser = Depends(require_reviewer)) -> Iterator[Db]:
    with open_db("authenticated", user.id, {"email": user.email}) as db:
        yield db


def get_db_admin(user: CurrentUser = Depends(require_admin)) -> Iterator[Db]:
    with open_db("authenticated", user.id, {"email": user.email}) as db:
        yield db
