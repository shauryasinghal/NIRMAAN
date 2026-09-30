import base64
import datetime as dt
import json
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from tests.conftest import JWT_SECRET, mint_token


def me(client, token, scheme="Bearer"):
    return client.get("/api/auth/me", headers={"Authorization": f"{scheme} {token}"} if token is not None else {})


def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()


# ── JWT verification ────────────────────────────────────────────────────────────────────────
def test_missing_or_malformed_credentials_are_401(client, student):
    assert me(client, None).status_code == 401
    assert me(client, "garbage").status_code == 401
    assert me(client, "a.b.c").status_code == 401
    assert me(client, student.token, scheme="Basic").status_code == 401
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer"})
    assert r.status_code in (401, 403) and r.json()["error"]["code"] in ("unauthorized", "forbidden")
    assert me(client, student.token).status_code == 200


def test_expired_wrong_secret_wrong_audience_are_rejected(client, student):
    assert me(client, mint_token(student.id, student.session_id, exp_delta=-3600)).status_code == 401
    assert "expired" in me(client, mint_token(student.id, student.session_id, exp_delta=-3600)).json()["error"]["message"].lower()
    assert me(client, mint_token(student.id, student.session_id, secret="x" * 40)).status_code == 401
    assert me(client, mint_token(student.id, student.session_id, aud="anon")).status_code == 401
    assert me(client, mint_token(student.id, student.session_id, aud=None) if False else mint_token(student.id, student.session_id, extra={"aud": "other"})).status_code == 401


def test_alg_none_and_tampered_payload_are_rejected(client, student, admin):
    none_tok = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64({'sub': admin.id, 'aud': 'authenticated', 'role': 'authenticated', 'exp': 9999999999})}."
    assert me(client, none_tok).status_code == 401
    head, payload, sig = student.token.split(".")
    evil = b64({**json.loads(base64.urlsafe_b64decode(payload + "==")), "sub": admin.id})
    assert me(client, f"{head}.{evil}.{sig}").status_code == 401                       # signature no longer matches


def test_anon_and_service_role_keys_are_not_user_tokens(client):
    anon = jwt.encode({"iss": "supabase", "role": "anon", "aud": "authenticated", "exp": 9999999999}, JWT_SECRET, algorithm="HS256")
    svc = jwt.encode({"iss": "supabase", "role": "service_role", "aud": "authenticated", "exp": 9999999999}, JWT_SECRET, algorithm="HS256")
    assert me(client, anon).status_code == 401 and me(client, svc).status_code == 401       # no `sub`
    with_sub = mint_token(str(uuid.uuid4()), None, role="service_role")
    assert me(client, with_sub).status_code == 401                                        # role claim must be `authenticated`


def test_valid_identity_without_a_profile_is_forbidden_not_guessed(client):
    ghost = mint_token(str(uuid.uuid4()), None)
    r = me(client, ghost)
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"


def test_role_claims_inside_the_token_never_grant_privilege(client, student):
    for extra in ({"role": "admin"}, {"app_metadata": {"role": "admin"}}, {"user_metadata": {"role": "admin"}}, {"user_role": "admin"}):
        tok = mint_token(student.id, student.session_id, extra=extra)
        r = me(client, tok)
        if r.status_code == 200:
            assert r.json()["role"] == "student"
        assert client.get("/api/admin/users", headers={"Authorization": f"Bearer {tok}"}).status_code in (401, 403)


def test_revoked_session_is_rejected_even_before_expiry(client, make_user, svc):
    u = make_user("student", "Signs Out")
    assert me(client, u.token).status_code == 200
    from app.core.security import clear_auth_caches
    from app.db.session import get_engine
    from sqlalchemy import text
    with get_engine().begin() as c:                                                       # what GoTrue does on sign-out
        c.execute(text("delete from auth.sessions where id = cast(:s as uuid)"), {"s": u.session_id})
    clear_auth_caches()
    r = me(client, u.token)
    assert r.status_code == 401 and "session" in r.json()["error"]["message"].lower()


def test_session_from_another_user_cannot_be_borrowed(client, student, student2):
    tok = mint_token(student.id, student2.session_id)                                     # valid signature, someone else's session id
    assert me(client, tok).status_code == 401


def test_asymmetric_jwks_path_and_alg_confusion(client, student, monkeypatch):
    from app.core import security
    from app.core.config import get_settings, reset_settings_cache
    key = ec.generate_private_key(ec.SECP256R1())
    other = ec.generate_private_key(ec.SECP256R1())

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            class K: pass
            k = K(); k.key = key.public_key(); return k
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")
    reset_settings_cache()
    monkeypatch.setattr(security, "_jwks", lambda url: FakeClient())
    claims = {"sub": student.id, "aud": "authenticated", "role": "authenticated", "email": student.email, "session_id": student.session_id,
              "iss": "https://proj.supabase.co/auth/v1", "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)}
    good = jwt.encode(claims, key, algorithm="ES256", headers={"kid": "k1"})
    assert me(client, good).status_code == 200
    assert me(client, jwt.encode(claims, other, algorithm="ES256")).status_code == 401                 # signed by a different key
    assert me(client, jwt.encode({**claims, "iss": "https://evil.example/auth/v1"}, key, algorithm="ES256")).status_code == 401
    # HS256 token accepted only with the shared secret — never with the public key as the "secret"
    pub = key.public_key().public_bytes(__import__("cryptography").hazmat.primitives.serialization.Encoding.PEM,
                                        __import__("cryptography").hazmat.primitives.serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    try:
        confusion = jwt.encode(claims, pub, algorithm="HS256")
    except Exception:
        confusion = None
    if confusion:
        assert me(client, confusion).status_code == 401
    monkeypatch.delenv("SUPABASE_URL"); reset_settings_cache()


# ── error contract ─────────────────────────────────────────────────────────────────────────
def test_every_error_uses_one_shape_and_never_leaks_internals(client, student):
    cases = [(client.get("/api/auth/me"), 401, "unauthorized"), (client.get("/api/admin/users", headers=student.h), 403, "forbidden"),
             (client.get("/api/opportunities/00000000-0000-0000-0000-000000000000", headers=student.h), 404, "not_found"),
             (client.get("/api/does-not-exist", headers=student.h), 404, "not_found"),
             (client.put("/api/profile", headers=student.h, json={"availabilityHrs": 999}), 422, "validation_error"),
             (client.post("/api/applications", headers=student.h, json={}), 422, "validation_error"),
             (client.post("/api/auth/me", headers=student.h), 405, "bad_request")]
    for r, status, code in cases:
        assert r.status_code == status, (r.request.url, r.text)
        e = r.json()["error"]
        assert e["code"] == code and e["message"] and e["requestId"] and set(e) <= {"code", "message", "details", "requestId"}
        assert "Traceback" not in r.text and "sqlalchemy" not in r.text.lower() and "psycopg" not in r.text.lower()
    v = client.put("/api/profile", headers=student.h, json={"availabilityHrs": 999}).json()["error"]["details"]["fields"][0]
    assert v["field"] == "availabilityHrs" or "availability" in v["field"].lower()
    assert "input" not in v                                                      # submitted values are not echoed back


def test_unhandled_exceptions_become_generic_500s(client, student, monkeypatch):
    from app.routers import profile as pr
    monkeypatch.setattr(pr.svc, "get_profile", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("secret internal detail: password=hunter2")))
    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        r = c.get("/api/profile", headers=student.h)
    assert r.status_code == 500 and r.json()["error"]["code"] == "server_error"
    assert "hunter2" not in r.text and "RuntimeError" not in r.text and r.json()["error"]["requestId"]


def test_rate_limit_error_shape_and_retry_after(client, student):
    from app.core.middleware import limiter
    for _ in range(30):
        limiter.hit(f"opp-event:{student.id}", 120, 60)
    codes = []
    o = client.get("/api/opportunities?page_size=1", headers=student.h).json()["items"] if False else None
    r = None
    for i in range(125):
        r = client.post("/api/opportunities/00000000-0000-0000-0000-000000000001/events", headers=student.h, json={"type": "view"})
        if r.status_code == 429:
            break
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited" and int(r.headers["Retry-After"]) >= 1


# ── HTTP hygiene ───────────────────────────────────────────────────────────────────────────
def test_security_headers_and_request_id(client):
    r = client.get("/health", headers={"X-Request-ID": "abcdef123456"})
    assert r.headers["x-request-id"] == "abcdef123456" and r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] and r.headers["cache-control"] == "no-store"
    bad = client.get("/health", headers={"X-Request-ID": "x\r\nInjected: 1"})
    assert bad.headers["x-request-id"] != "x" and len(bad.headers["x-request-id"]) == 32


def test_cors_allows_only_configured_origins(client):
    ok = client.options("/api/auth/me", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173" and "authorization" in ok.headers["access-control-allow-headers"].lower()
    evil = client.options("/api/auth/me", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in evil.headers
    assert client.get("/health", headers={"Origin": "https://evil.example"}).headers.get("access-control-allow-origin") is None


def test_oversized_bodies_are_refused_early(client, student):
    r = client.post("/api/profile/resume/extract", headers={**student.h, "Content-Length": str(50 * 1024 * 1024)}, content=b"x")
    assert r.status_code == 413 and r.json()["error"]["code"] == "payload_too_large"


def test_health_is_dependency_free_and_ready_reports_checks_without_secrets(client, monkeypatch):
    h = client.get("/health").json()
    assert h["status"] == "ok" and set(h) == {"status", "service", "version"}
    r = client.get("/ready")
    body = r.json()
    assert r.status_code == 200 and body["status"] == "ready"
    assert body["checks"]["database"]["status"] == "ok" and body["checks"]["pgvector"]["status"] == "ok" and body["checks"]["schema"]["status"] == "ok"
    assert body["checks"]["googleIntegrations"]["status"] == "disabled"
    text = r.text
    assert JWT_SECRET not in text and "postgresql" not in text and "password" not in text.lower()
    from app import main
    monkeypatch.setattr(main, "open_db", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("db down: postgresql://u:pw@h/db")))
    down = client.get("/ready")
    assert down.status_code == 503 and down.json()["status"] == "not_ready" and "pw@" not in down.text and down.json()["checks"]["database"]["status"] == "error"


# ── configuration & logging ────────────────────────────────────────────────────────────────
def test_production_refuses_unsafe_configuration(monkeypatch):
    for v in ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_JWT_SECRET", "CORS_ORIGINS"):
        monkeypatch.delenv(v, raising=False)
    from pydantic import ValidationError
    from app.core.config import Settings
    for kw in ({}, {"database_url": "postgresql://x", "supabase_url": "https://p.supabase.co"},                                  # no CORS
               {"database_url": "postgresql://x", "supabase_url": "https://p.supabase.co", "cors_origins": "*"},
               {"database_url": "postgresql://x", "cors_origins": "https://a.b"},                                                 # cannot verify tokens
               {"database_url": "postgresql://x", "supabase_jwt_secret": "short", "cors_origins": "https://a.b"}):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, NIRMAAN_ENV="production", **kw)
    ok = Settings(_env_file=None, NIRMAAN_ENV="production", database_url="postgres://u:p@h/db", supabase_url="https://p.supabase.co", cors_origins="https://app.nirmaan.app")
    assert ok.is_production and ok.sqlalchemy_url.startswith("postgresql+psycopg2://") and ok.cors_list == ["https://app.nirmaan.app"]


def test_docs_are_disabled_in_production(monkeypatch):
    from app.core.config import reset_settings_cache
    from app.main import create_app
    monkeypatch.setenv("NIRMAAN_ENV", "production"); monkeypatch.setenv("SUPABASE_URL", "https://p.supabase.co"); monkeypatch.setenv("CORS_ORIGINS", "https://app.nirmaan.app")
    reset_settings_cache()
    try:
        a = create_app()
        assert a.docs_url is None and a.openapi_url is None
    finally:
        monkeypatch.setenv("NIRMAAN_ENV", "test"); monkeypatch.setenv("SUPABASE_URL", ""); reset_settings_cache()


def test_log_redaction_removes_tokens_and_secrets():
    from app.core.logging import redact
    jwt_like = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"
    s = redact(f"Authorization: Bearer {jwt_like} password=hunter2 client_secret: 'GOCSPX-abc123' url=postgresql://user:s3cr3t@host/db access_token=xyz code=4/0AX4")
    for leak in (jwt_like, "hunter2", "GOCSPX-abc123", "s3cr3t", "xyz", "4/0AX4"):
        assert leak not in s
    assert s.count("REDACTED") >= 5
