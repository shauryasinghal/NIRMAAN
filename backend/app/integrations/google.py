"""Optional Google Calendar / Gmail connections via OAuth 2.0 (authorization-code flow, server-side secret).

This is NOT sign-in (Supabase Auth owns Google login). Rules:
  * off unless GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI and TOKEN_ENCRYPTION_KEY are all set — never faked
  * minimum scopes: calendar.events (create a deadline event) · gmail.send (email yourself a reminder)
  * `state` is a short-lived signed token bound to the user id + provider (blocks CSRF / cross-account linking)
  * tokens are Fernet-encrypted at rest in a table clients cannot read; refresh happens server-side
  * nothing is written to a user's calendar or mailbox without an explicit `confirm: true` request
  * no password is ever requested, stored or logged
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import uuid
from urllib.parse import urlencode

import httpx
import jwt
from cryptography.fernet import Fernet, InvalidToken

from ..core.config import get_settings
from ..core.errors import AppError, bad_request, unavailable
from ..core.logging import get_logger
from ..db.session import Db

log = get_logger("google")
AUTH_URL, TOKEN_URL, REVOKE_URL = "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", "https://oauth2.googleapis.com/revoke"
CAL_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
GMAIL_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
SCOPES = {"google_calendar": "https://www.googleapis.com/auth/calendar.events", "gmail": "https://www.googleapis.com/auth/gmail.send"}
PROVIDERS = {"calendar": "google_calendar", "gmail": "gmail"}

_http_factory = lambda: httpx.Client(timeout=10.0)     # replaced in tests


def _fernet() -> Fernet:
    return Fernet(get_settings().token_encryption_key.encode())


def require_enabled() -> None:
    if not get_settings().google_integrations_enabled:
        raise unavailable("Google integrations are not configured on this server.", {"reason": "google_not_configured"})


def _state_key() -> str:
    return hashlib.sha256(("nirmaan-oauth-state:" + get_settings().token_encryption_key).encode()).hexdigest()


def make_state(user_id: str, provider: str) -> str:
    return jwt.encode({"sub": user_id, "prv": provider, "jti": uuid.uuid4().hex, "purpose": "google_oauth",
                       "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=10)}, _state_key(), algorithm="HS256")


def check_state(state: str, user_id: str, provider: str) -> None:
    try:
        c = jwt.decode(state, _state_key(), algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        raise bad_request("This connection attempt expired or is invalid. Please start again.", {"reason": "invalid_state"})
    if c.get("purpose") != "google_oauth" or c.get("sub") != user_id or c.get("prv") != provider:
        raise bad_request("This connection attempt belongs to a different account or provider.", {"reason": "state_mismatch"})


def authorization_url(user_id: str, provider: str) -> str:
    s = get_settings()
    q = {"client_id": s.google_client_id, "redirect_uri": s.google_redirect_uri, "response_type": "code", "scope": SCOPES[provider], "access_type": "offline",
         "prompt": "consent", "include_granted_scopes": "false", "state": make_state(user_id, provider)}
    return f"{AUTH_URL}?{urlencode(q)}"


def _post_token(data: dict) -> dict:
    s = get_settings()
    with _http_factory() as c:
        r = c.post(TOKEN_URL, data={**data, "client_id": s.google_client_id, "client_secret": s.google_client_secret})
    if r.status_code >= 400:
        log.warning("google token endpoint refused", extra={"event": "oauth_error", "status": r.status_code})
        raise AppError(502, "service_unavailable", "Google did not accept the request. Please try connecting again.", {"reason": "google_oauth_failed"})
    return r.json()


def exchange_and_store(db: Db, user_id: str, provider: str, code: str) -> dict:
    s = get_settings()
    tok = _post_token({"code": code, "grant_type": "authorization_code", "redirect_uri": s.google_redirect_uri})
    granted = set((tok.get("scope") or "").split())
    if SCOPES[provider] not in granted:
        raise bad_request("The required permission was not granted.", {"reason": "scope_denied", "required": SCOPES[provider]})
    f = _fernet()
    expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=int(tok.get("expires_in", 3600)))
    with db.service():
        db.run("""insert into public.oauth_connections (profile_id, provider, scopes, access_token_enc, refresh_token_enc, expires_at)
                  values (cast(:u as uuid), :p, :s, :a, :r, :e)
                  on conflict (profile_id, provider) do update set scopes = excluded.scopes, access_token_enc = excluded.access_token_enc,
                     refresh_token_enc = coalesce(excluded.refresh_token_enc, public.oauth_connections.refresh_token_enc), expires_at = excluded.expires_at, connected_at = now()""",
               u=user_id, p=provider, s=[SCOPES[provider]], a=f.encrypt(tok["access_token"].encode()).decode(),
               r=f.encrypt(tok["refresh_token"].encode()).decode() if tok.get("refresh_token") else None, e=expires)
    return {"provider": provider, "scopes": [SCOPES[provider]]}


def status(db: Db, user_id: str) -> dict:
    s = get_settings()
    with db.service():
        rows = {r["provider"]: r for r in db.all("select provider, scopes, connected_at from public.oauth_connections where profile_id = cast(:u as uuid)", u=user_id)}
    def one(p):
        r = rows.get(p)
        return {"connected": bool(r), "scopes": r["scopes"] if r else [], "connectedAt": r["connected_at"] if r else None}
    return {"enabled": s.google_integrations_enabled, "calendar": one("google_calendar"), "gmail": one("gmail"),
            "reason": None if s.google_integrations_enabled else "Not configured on this server (Google OAuth client and encryption key required)."}


def _access_token(db: Db, user_id: str, provider: str) -> str:
    with db.service():
        r = db.one("select access_token_enc, refresh_token_enc, expires_at from public.oauth_connections where profile_id = cast(:u as uuid) and provider = :p", u=user_id, p=provider)
        if not r:
            raise bad_request(f"Connect {'Google Calendar' if provider == 'google_calendar' else 'Gmail'} first.", {"reason": "not_connected"})
        f = _fernet()
        try:
            access = f.decrypt(r["access_token_enc"].encode()).decode() if r["access_token_enc"] else None
            if access and r["expires_at"] > dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=60):
                return access
            if not r["refresh_token_enc"]:
                raise bad_request("The connection expired. Please reconnect.", {"reason": "reconnect_required"})
            fresh = _post_token({"grant_type": "refresh_token", "refresh_token": f.decrypt(r["refresh_token_enc"].encode()).decode()})
        except InvalidToken:
            raise bad_request("The stored connection could not be read. Please reconnect.", {"reason": "reconnect_required"})
        db.run("update public.oauth_connections set access_token_enc = :a, expires_at = :e where profile_id = cast(:u as uuid) and provider = :p",
               a=f.encrypt(fresh["access_token"].encode()).decode(), e=dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=int(fresh.get("expires_in", 3600))), u=user_id, p=provider)
        return fresh["access_token"]


def disconnect(db: Db, user_id: str, provider: str) -> bool:
    with db.service():
        r = db.one("select refresh_token_enc, access_token_enc from public.oauth_connections where profile_id = cast(:u as uuid) and provider = :p", u=user_id, p=provider)
        if not r:
            return False
        try:                                         # best-effort revocation at Google; local deletion always happens
            tok = _fernet().decrypt((r["refresh_token_enc"] or r["access_token_enc"]).encode()).decode()
            with _http_factory() as c:
                c.post(REVOKE_URL, data={"token": tok})
        except Exception:
            log.info("token revoke skipped", extra={"event": "oauth_revoke_skipped"})
        db.run("delete from public.oauth_connections where profile_id = cast(:u as uuid) and provider = :p", u=user_id, p=provider)
    return True


def create_deadline_event(db: Db, user_id: str, title: str, deadline: dt.date, description: str, url: str | None) -> dict:
    tok = _access_token(db, user_id, "google_calendar")
    body = {"summary": f"Deadline: {title}", "description": description + (f"\n{url}" if url else ""), "start": {"date": deadline.isoformat()},
            "end": {"date": (deadline + dt.timedelta(days=1)).isoformat()}, "reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 24 * 60}]},
            "source": {"title": "NIRMAAN", "url": get_settings().frontend_url}}
    with _http_factory() as c:
        r = c.post(CAL_URL, json=body, headers={"Authorization": f"Bearer {tok}"})
    if r.status_code >= 400:
        raise AppError(502, "service_unavailable", "Google Calendar rejected the event. Try reconnecting.", {"reason": "calendar_error"})
    return {"eventId": r.json().get("id"), "htmlLink": r.json().get("htmlLink")}


def send_reminder_email(db: Db, user_id: str, to_email: str, subject: str, text: str) -> dict:
    """Sends ONLY to the connected user's own address."""
    tok = _access_token(db, user_id, "gmail")
    safe = lambda s: s.replace("\r", " ").replace("\n", " ")[:200]
    raw = f"To: {safe(to_email)}\r\nSubject: {safe(subject)}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{text}"
    with _http_factory() as c:
        r = c.post(GMAIL_URL, json={"raw": base64.urlsafe_b64encode(raw.encode()).decode()}, headers={"Authorization": f"Bearer {tok}"})
    if r.status_code >= 400:
        raise AppError(502, "service_unavailable", "Gmail rejected the message. Try reconnecting.", {"reason": "gmail_error"})
    return {"messageId": r.json().get("id")}
