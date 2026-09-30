"""TEST-ONLY stand-in for the Supabase Auth (GoTrue) HTTP API, used by the Playwright suite.

There is no Docker/GoTrue on this machine, so E2E runs the *real* frontend (supabase-js), the *real* FastAPI service
and the *real* Postgres schema (incl. the on_auth_user_created trigger) against this tiny server for the auth endpoints
only. It is NOT part of the product and is never imported by the app: production authentication is Supabase Auth.

What it does NOT cover (and E2E says so): email delivery, Google's consent screen, password-strength policy and the
hosted JWKS/ES256 signing — those need the real Supabase project.

Run:  DATABASE_URL=postgresql:///nirmaan_e2e SUPABASE_JWT_SECRET=... python -m e2e.fake_gotrue
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import jwt
from sqlalchemy import create_engine, text

PORT = int(os.environ.get("FAKE_GOTRUE_PORT", "54321"))
SECRET = os.environ["SUPABASE_JWT_SECRET"]
BASE = f"http://127.0.0.1:{PORT}"
GOOGLE = os.environ.get("E2E_GOOGLE") == "1"
engine = create_engine(os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg2://", 1), pool_pre_ping=True)


def now(): return dt.datetime.now(dt.timezone.utc)


def user_json(row) -> dict:
    meta = row["raw_user_meta_data"] or {}
    return {"id": str(row["id"]), "aud": "authenticated", "role": "authenticated", "email": row["email"], "email_confirmed_at": row["email_confirmed_at"].isoformat() if row["email_confirmed_at"] else None,
            "phone": "", "app_metadata": {"provider": "email", "providers": ["email"]}, "user_metadata": meta, "identities": [], "created_at": row["created_at"].isoformat(), "updated_at": row["updated_at"].isoformat()}


def new_session(conn, user) -> dict:
    sid = str(uuid.uuid4())
    conn.execute(text("insert into auth.sessions (id, user_id) values (cast(:s as uuid), cast(:u as uuid))"), {"s": sid, "u": str(user["id"])})
    iat = now(); exp = iat + dt.timedelta(hours=1)
    token = jwt.encode({"iss": f"{BASE}/auth/v1", "sub": str(user["id"]), "aud": "authenticated", "role": "authenticated", "email": user["email"], "session_id": sid,
                        "iat": iat, "exp": exp, "app_metadata": {"provider": "email"}, "user_metadata": user["raw_user_meta_data"] or {}}, SECRET, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600, "expires_at": int(exp.timestamp()), "refresh_token": f"rt.{sid}", "user": user_json(user)}


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a): pass

    def _send(self, status: int, body=None, headers=None):
        raw = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        for k, v in {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
                     "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Content-Type": "application/json", "Content-Length": str(len(raw)), **(headers or {})}.items():
            self.send_header(k, v)
        self.end_headers(); self.wfile.write(raw)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        try: return json.loads(self.rfile.read(n) or b"{}")
        except ValueError: return {}

    def _err(self, status, code, msg): self._send(status, {"code": status, "error_code": code, "msg": msg, "message": msg})

    def do_OPTIONS(self): self._send(204)

    def do_GET(self):
        p = urlparse(self.path)
        if p.path == "/auth/v1/settings":
            return self._send(200, {"external": {"email": True, "google": GOOGLE}, "disable_signup": False, "mailer_autoconfirm": False})
        if p.path == "/auth/v1/user":
            with engine.begin() as c:
                row = self._user_from_token(c)
                return self._send(200, user_json(row)) if row else self._err(401, "bad_jwt", "invalid JWT")
        if p.path == "/auth/v1/authorize":
            return self._send(200, {"e2e": "Google OAuth needs a real Supabase project", "provider": parse_qs(p.query).get("provider")})
        self._err(404, "not_found", "not found")

    def _user_from_token(self, conn):
        tok = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        try: claims = jwt.decode(tok, SECRET, algorithms=["HS256"], audience="authenticated")
        except jwt.PyJWTError: return None
        return conn.execute(text("select * from auth.users where id = cast(:i as uuid)"), {"i": claims["sub"]}).mappings().first()

    def do_POST(self):
        p, b = urlparse(self.path), self._body()
        q = parse_qs(p.query)
        with engine.begin() as c:
            if p.path == "/auth/v1/signup":
                email, pw = (b.get("email") or "").lower(), b.get("password") or ""
                if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email): return self._err(422, "validation_failed", "Unable to validate email address: invalid format")
                if len(pw) < 8: return self._err(422, "weak_password", "Password should be at least 8 characters.")
                if c.execute(text("select 1 from auth.users where email = :e"), {"e": email}).first(): return self._err(422, "user_already_exists", "User already registered")
                unverified = email.startswith("unverified+")
                row = c.execute(text("insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values (:e, cast(:m as jsonb), cast(:a as jsonb), :c) returning *"),
                                {"e": email, "m": json.dumps(b.get("data") or {}), "a": json.dumps({"e2e_password": pw, "provider": "email"}), "c": None if unverified else now()}).mappings().first()
                return self._send(200, user_json(row)) if unverified else self._send(200, new_session(c, row))
            if p.path == "/auth/v1/token":
                grant = (q.get("grant_type") or [""])[0]
                if grant == "password":
                    row = c.execute(text("select * from auth.users where email = :e"), {"e": (b.get("email") or "").lower()}).mappings().first()
                    if not row or (row["raw_app_meta_data"] or {}).get("e2e_password") != b.get("password"): return self._err(400, "invalid_credentials", "Invalid login credentials")
                    if not row["email_confirmed_at"]: return self._err(400, "email_not_confirmed", "Email not confirmed")
                    return self._send(200, new_session(c, row))
                if grant == "refresh_token":
                    sid = (b.get("refresh_token") or "").removeprefix("rt.")
                    row = None
                    try: row = c.execute(text("select u.* from auth.users u join auth.sessions s on s.user_id = u.id where s.id = cast(:s as uuid)"), {"s": sid}).mappings().first()
                    except Exception: pass
                    return self._send(200, new_session(c, row)) if row else self._err(400, "refresh_token_not_found", "Invalid Refresh Token")
            if p.path == "/auth/v1/logout":
                tok = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
                try: sid = jwt.decode(tok, SECRET, algorithms=["HS256"], audience="authenticated")["session_id"]; c.execute(text("delete from auth.sessions where id = cast(:s as uuid)"), {"s": sid})
                except Exception: pass
                return self._send(204)
            if p.path in ("/auth/v1/recover", "/auth/v1/resend"): return self._send(200, {})
        self._err(404, "not_found", "not found")

    def do_PUT(self):
        b = self._body()
        with engine.begin() as c:
            row = self._user_from_token(c)
            if not row: return self._err(401, "bad_jwt", "invalid JWT")
            if b.get("password"):
                if len(b["password"]) < 8: return self._err(422, "weak_password", "Password should be at least 8 characters.")
                c.execute(text("update auth.users set raw_app_meta_data = raw_app_meta_data || cast(:a as jsonb), updated_at = now() where id = :i"), {"a": json.dumps({"e2e_password": b["password"]}), "i": row["id"]})
            return self._send(200, user_json(row))


if __name__ == "__main__":
    print(f"fake GoTrue (TEST ONLY) on {BASE}  google={GOOGLE}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
