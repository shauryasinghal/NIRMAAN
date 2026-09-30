"""Regression: hosted Supabase answers 401 to GET /auth/v1/settings without an `apikey` header, which made
/api/auth/config report Google as permanently disabled (found in the hosted smoke test). The API must send the public key."""
import httpx

from app.core.config import reset_settings_cache
from app.routers import auth as auth_router


class _Resp:
    def __init__(self, status, body): self.status_code, self._b = status, body
    def raise_for_status(self):
        if self.status_code >= 400: raise httpx.HTTPStatusError("x", request=httpx.Request("GET", "http://x"), response=httpx.Response(self.status_code))
    def json(self): return self._b


def _fake_supabase(expect_key):
    def get(url, headers=None, timeout=None):
        assert url == "https://proj.supabase.co/auth/v1/settings"
        ok = (headers or {}).get("apikey") == expect_key
        return _Resp(200, {"external": {"google": True, "email": True}, "mailer_autoconfirm": False}) if ok else _Resp(401, {})
    return get


def test_auth_settings_request_carries_the_public_apikey(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co"); monkeypatch.setenv("SUPABASE_ANON_KEY", "sb_publishable_test")
    reset_settings_cache(); auth_router.clear_config_cache()
    monkeypatch.setattr(auth_router.httpx, "get", _fake_supabase("sb_publishable_test"))
    out = auth_router.auth_config()
    assert out["verified"] is True and out["google"] is True and out["emailConfirmationRequired"] is True
    auth_router.clear_config_cache(); reset_settings_cache()


def test_without_the_key_the_config_fails_closed_not_open(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co"); monkeypatch.setenv("SUPABASE_ANON_KEY", "")
    reset_settings_cache(); auth_router.clear_config_cache()
    monkeypatch.setattr(auth_router.httpx, "get", _fake_supabase("sb_publishable_test"))
    out = auth_router.auth_config()
    assert out["verified"] is False and out["google"] is False          # never claims a method is enabled when it could not check
    auth_router.clear_config_cache(); reset_settings_cache()
