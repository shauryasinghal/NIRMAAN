"""Chat configuration: off unless explicitly switched on AND keyed, the key never prints, production refuses a half-configured assistant."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings

FAKE_KEY = "sk-ant-api03-FAKE-KEY-for-tests-only-0123456789"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in ("CHAT_ENABLED", "CHAT_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL", "ANTHROPIC_API_KEY", "CHAT_MODEL", "CHAT_MAX_OUTPUT_TOKENS", "CHAT_TIMEOUT_SECONDS", "CHAT_RATE_LIMIT_PER_MINUTE", "CHAT_DAILY_LIMIT"):
        monkeypatch.delenv(k, raising=False)


def make(**env) -> Settings:
    return Settings(_env_file=None, **env)          # never read a developer's real .env


def test_chat_is_off_by_default_with_a_documented_model():
    s = make()
    assert s.chat_enabled is False and s.chat_available is False
    assert s.chat_model == "claude-sonnet-5-5"
    assert s.chat_max_output_tokens == 1024 and s.chat_rate_limit_per_minute == 8 and s.chat_daily_limit == 200


def test_available_only_when_enabled_and_keyed(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    assert make().chat_available is False                              # key alone does not switch it on
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    monkeypatch.setenv("CHAT_ENABLED", "true")
    assert make().chat_available is False                              # flag alone is not enough
    monkeypatch.setenv("ANTHROPIC_API_KEY", "   ")
    assert make().chat_available is False                              # a blank key is no key
    monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    assert make().chat_available is True


def test_the_key_never_appears_in_repr_or_str(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    s = make()
    assert FAKE_KEY not in repr(s) and FAKE_KEY not in str(s) and FAKE_KEY not in repr(s.anthropic_api_key)
    assert s.anthropic_api_key.get_secret_value() == FAKE_KEY


@pytest.mark.parametrize("name,value", [("CHAT_MAX_OUTPUT_TOKENS", "100000"), ("CHAT_MAX_OUTPUT_TOKENS", "1"), ("CHAT_TIMEOUT_SECONDS", "0"),
                                        ("CHAT_RATE_LIMIT_PER_MINUTE", "0"), ("CHAT_DAILY_LIMIT", "0")])
def test_limits_are_bounded(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        make()


PROD = {"NIRMAAN_ENV": "production", "database_url": "postgresql:///x", "supabase_url": "https://x.supabase.co", "cors_origins": "https://app.example"}


def test_production_refuses_chat_enabled_without_a_key(monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "true")
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        make(**PROD)
    monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    assert make(**PROD).chat_available is True


def test_production_is_fine_with_chat_off_and_no_key():
    assert make(**PROD).chat_available is False


# ── provider selection (Anthropic stays the default; Gemini is opt-in) ────────────────────────
GKEY = "AIzaSyFAKE-FAKE-FAKE-FAKE-FAKE-FAKE-000"


def test_anthropic_is_the_default_provider_and_gemini_has_a_documented_default_model():
    s = make()
    assert s.chat_provider == "anthropic" and s.chat_provider_name == "Anthropic"
    assert s.gemini_model == "gemini-3.5-flash-lite" and s.chat_model == "claude-sonnet-5-5"


def test_availability_uses_only_the_selected_providers_key(monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "true"); monkeypatch.setenv("GEMINI_API_KEY", GKEY)
    assert make().chat_available is False                                         # default provider is anthropic, and it has no key
    monkeypatch.setenv("CHAT_PROVIDER", "gemini")
    s = make()
    assert s.chat_available is True and s.chat_provider_name == "Google Gemini"
    monkeypatch.delenv("GEMINI_API_KEY"); monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    assert make().chat_available is False                                         # the OTHER provider's key does not count
    monkeypatch.setenv("GEMINI_API_KEY", "   ")
    assert make().chat_available is False                                         # a blank key is no key


def test_the_gemini_key_never_appears_in_repr_or_str(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", GKEY); monkeypatch.setenv("CHAT_PROVIDER", "gemini")
    s = make()
    assert GKEY not in repr(s) and GKEY not in str(s) and GKEY not in repr(s.gemini_api_key) and GKEY not in repr(s.chat_api_key)
    assert s.gemini_api_key.get_secret_value() == GKEY


def test_an_unknown_provider_is_refused(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "openai")
    with pytest.raises(ValidationError):
        make()


def test_production_refuses_gemini_without_its_own_key(monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "true"); monkeypatch.setenv("CHAT_PROVIDER", "gemini"); monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        make(**PROD)                                                              # an Anthropic key does not satisfy a Gemini setup
    monkeypatch.setenv("GEMINI_API_KEY", GKEY)
    assert make(**PROD).chat_available is True


def test_secret_values_lists_configured_secrets_longest_first_and_skips_empty_or_short(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-secret-value-123456"); monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-0000")
    monkeypatch.setenv("CRON_SECRET", "short"); monkeypatch.setenv("SUPABASE_JWT_SECRET", "x" * 40); monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "")
    got = make().secret_values
    assert got == ["x" * 40, "gemini-secret-value-123456", "sk-ant-test-0000"]
    assert "short" not in got and "" not in got
    monkeypatch.setenv("ANTHROPIC_API_KEY", "gemini-secret-value-123456")
    assert make().secret_values.count("gemini-secret-value-123456") == 1                     # duplicates collapse


def test_the_suite_never_reads_a_developers_dotenv():
    """Regression: a real GEMINI_API_KEY / CHAT_PROVIDER saved in backend/.env must not leak into tests (they would fail, or worse, use the key)."""
    from app.core.config import get_settings, reset_settings_cache
    assert Settings.model_config["env_file"] is None
    reset_settings_cache()
    try:
        s = get_settings()
        assert s.chat_enabled is False and s.chat_provider == "anthropic" and s.gemini_api_key.get_secret_value() == "" and s.anthropic_api_key.get_secret_value() == ""
        assert s.database_url.endswith("nirmaan_test") and s.supabase_url == ""
    finally:
        reset_settings_cache()
