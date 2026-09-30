"""Test harness: every session rebuilds a scratch Postgres from ZERO (Supabase stub + every migration),
so tests never depend on a dirty database. Tokens are minted like Supabase's legacy HS256 tokens."""
from __future__ import annotations

import datetime as dt
import os
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path

import jwt
import pytest

ROOT = Path(__file__).resolve().parents[2]
JWT_SECRET = "test-only-secret-that-is-long-enough-1234567890"
TEST_DB = os.environ.get("NIRMAAN_TEST_DB", "nirmaan_test")

os.environ.update({
    "NIRMAAN_ENV": "test", "DATABASE_URL": f"postgresql:///{TEST_DB}", "SUPABASE_JWT_SECRET": JWT_SECRET, "SUPABASE_URL": "",
    "CRON_SECRET": "test-cron-secret", "LOG_JSON": "false", "LOG_LEVEL": "WARNING", "RATE_LIMIT_PER_MINUTE": "100000",
    "TOKEN_ENCRYPTION_KEY": "", "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": "", "GOOGLE_REDIRECT_URI": "",
})


@pytest.fixture(scope="session", autouse=True)
def _database():
    if not os.environ.get("NIRMAAN_KEEP_DB"):
        subprocess.run([str(ROOT / "supabase/local/reset.sh"), TEST_DB], check=True, capture_output=True)
    from app.core.config import reset_settings_cache
    reset_settings_cache()
    yield
    from app.db.session import dispose_engine
    dispose_engine()


@pytest.fixture(scope="session")
def client(_database):
    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_state():
    from app.core.middleware import limiter
    from app.core.security import clear_auth_caches
    from app.services import catalog
    limiter.reset(); clear_auth_caches(); catalog.clear_caches()
    yield


@dataclass
class User:
    id: str
    email: str
    token: str
    session_id: str

    @property
    def h(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}


def mint_token(user_id: str, session_id: str | None, *, secret: str = JWT_SECRET, alg: str = "HS256", exp_delta: int = 3600, aud: str = "authenticated",
               role: str = "authenticated", email: str = "x@test.dev", extra: dict | None = None) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    claims = {"sub": user_id, "aud": aud, "role": role, "email": email, "session_id": session_id,
              "iat": now, "exp": now + dt.timedelta(seconds=exp_delta)}
    claims.update(extra or {})
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, secret, algorithm=alg)


@pytest.fixture(scope="session")
def make_user(_database):
    from app.db.session import open_db, get_engine
    from sqlalchemy import text

    def _make(role: str = "student", name: str = "Test User", **profile) -> User:
        uid, sid = str(uuid.uuid4()), str(uuid.uuid4())
        email = f"{name.lower().replace(' ', '.')}.{uid[:8]}@test.dev"
        with get_engine().begin() as conn:   # owner connection: plays the role of GoTrue creating the user
            conn.execute(text("insert into auth.users (id, email, raw_user_meta_data) values (cast(:i as uuid), :e, cast(:m as jsonb))"),
                         {"i": uid, "e": email, "m": '{"full_name": "%s"}' % name})
            conn.execute(text("insert into auth.sessions (id, user_id) values (cast(:s as uuid), cast(:i as uuid))"), {"s": sid, "i": uid})
        with open_db("service_role") as db:
            if role != "student":
                db.run("update public.profiles set role = cast(:r as public.app_role) where id = cast(:i as uuid)", r=role, i=uid)
            if profile:
                sets = ", ".join(f"{k} = :{k}" for k in profile)
                db.run(f"update public.profiles set {sets} where id = cast(:i as uuid)", i=uid, **profile)
        return User(uid, email, mint_token(uid, sid, email=email), sid)
    return _make


@pytest.fixture()
def student(make_user): return make_user("student", "Stu Dent")
@pytest.fixture()
def student2(make_user): return make_user("student", "Other Student")
@pytest.fixture()
def reviewer(make_user): return make_user("reviewer", "Rev Iewer")
@pytest.fixture()
def admin(make_user): return make_user("admin", "Ad Min")


class ServiceHandle:
    """Service-role access for arranging / asserting state. Each call commits, so the API (another
    connection) sees it immediately. Use `with svc.tx() as db:` to run several statements atomically."""
    def tx(self):
        from app.db.session import open_db
        return open_db("service_role")

    def all(self, sql, **p):
        with self.tx() as db: return db.all(sql, **p)
    def one(self, sql, **p):
        with self.tx() as db: return db.one(sql, **p)
    def val(self, sql, **p):
        with self.tx() as db: return db.val(sql, **p)
    def run(self, sql, **p):
        with self.tx() as db: return db.run(sql, **p)


@pytest.fixture()
def svc(_database):
    return ServiceHandle()


@pytest.fixture(scope="session")
def catalog(_database):
    """The demo catalog, loaded through the real ingestion pipeline (idempotent)."""
    from app.db.session import open_db
    from app.ingestion.pipeline import run_source
    from app.ingestion.sources.fixture import FixtureSource
    with open_db("service_role") as db:
        run_source(db, FixtureSource())
    return True
