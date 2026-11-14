"""Demo seeding must never reach a real (non-local) project by accident."""
import pytest

from app.core.config import reset_settings_cache
from app.devseed import assert_demo_seed_allowed, seed_catalog, seed_reference_ideas

HOSTED_DB = "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres"


@pytest.fixture
def env(monkeypatch):
    def set_(**kv):
        for k, v in kv.items():
            monkeypatch.setenv(k, v)
        reset_settings_cache()
    yield set_
    monkeypatch.undo(); reset_settings_cache()


def test_local_socket_and_localhost_targets_are_allowed(env):
    env(DATABASE_URL="postgresql:///nirmaan_test", SUPABASE_URL="", NIRMAAN_ENV="test")
    assert "local socket" in assert_demo_seed_allowed()
    env(DATABASE_URL="postgresql://u:pw@localhost:5432/x", SUPABASE_URL="http://127.0.0.1:54321")
    assert "localhost" in assert_demo_seed_allowed()


@pytest.mark.parametrize("kw", [{"DATABASE_URL": HOSTED_DB}, {"DATABASE_URL": "postgresql:///nirmaan_test", "SUPABASE_URL": "https://abcdefgh.supabase.co"}])
def test_hosted_targets_are_refused_without_the_explicit_flag(env, kw, monkeypatch):
    monkeypatch.delenv("SEED_DEMO_DATA", raising=False)
    env(NIRMAAN_ENV="development", **{"SUPABASE_URL": "", **kw})
    with pytest.raises(SystemExit) as e:
        assert_demo_seed_allowed()
    assert "SEED_DEMO_DATA=true" in str(e.value) and "pw" not in str(e.value)        # tells you how, never leaks credentials
    with pytest.raises(SystemExit):
        seed_catalog(None)                                                          # the guard fires before any database access
    with pytest.raises(SystemExit):
        seed_reference_ideas(None)


def test_explicit_flag_allows_hosted_but_a_falsy_value_does_not(env, monkeypatch):
    env(NIRMAAN_ENV="development", SUPABASE_URL="", DATABASE_URL=HOSTED_DB)
    monkeypatch.setenv("SEED_DEMO_DATA", "1")
    with pytest.raises(SystemExit):
        assert_demo_seed_allowed()
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    assert "db.abcdefgh.supabase.co" in assert_demo_seed_allowed()


def test_production_is_never_allowed_even_with_the_flag(env, monkeypatch):
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    env(NIRMAAN_ENV="production", DATABASE_URL=HOSTED_DB, SUPABASE_URL="https://abcdefgh.supabase.co", CORS_ORIGINS="https://app.example.com")
    with pytest.raises(SystemExit) as e:
        assert_demo_seed_allowed()
    assert "never runs in production" in str(e.value)
