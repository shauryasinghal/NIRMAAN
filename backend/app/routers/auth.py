"""Identity is owned by Supabase Auth (signup, login, verification, reset, Google). This API only
reports who the verified caller is; there are deliberately no /register or /login routes here."""
from __future__ import annotations

import threading
import time

import httpx
from fastapi import APIRouter, Depends

from ..core.config import get_settings
from ..core.logging import get_logger
from ..core.security import CurrentUser, get_current_user, get_db
from ..db.session import Db
from ..schemas.common import ApiModel

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = get_logger("auth")


class MeOut(ApiModel):
    id: str
    email: str
    full_name: str
    role: str
    is_reviewer: bool
    is_admin: bool
    onboarding_completed: bool


@router.get("/me", response_model=MeOut, summary="The verified caller (role comes from the database)")
def me(user: CurrentUser = Depends(get_current_user)):
    from ..db.session import open_db
    with open_db("service_role", user.id) as db:
        done = bool(db.val("select onboarding_completed from public.profiles where id = cast(:u as uuid)", u=user.id))
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role.name, "is_reviewer": user.is_reviewer,
            "is_admin": user.is_admin, "onboarding_completed": done}


_cfg_cache: tuple[float, dict] | None = None
_cfg_lock = threading.Lock()


def _supabase_auth_settings() -> dict | None:
    s = get_settings()
    if not s.supabase_url:
        return None
    try:
        r = httpx.get(f"{s.supabase_url.rstrip('/')}/auth/v1/settings", timeout=4.0)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        log.warning("could not read Supabase auth settings", extra={"event": "auth_settings_unavailable", "code": type(exc).__name__})
        return None


@router.get("/config", summary="Which sign-in methods are actually enabled (read from Supabase, fail closed)")
def auth_config():
    """The frontend uses this to enable/disable 'Continue with Google'. It asks Supabase for the truth
    instead of trusting a flag, and reports `false` whenever it cannot confirm."""
    global _cfg_cache
    with _cfg_lock:
        if _cfg_cache and time.monotonic() - _cfg_cache[0] < 300:
            return _cfg_cache[1]
    raw = _supabase_auth_settings()
    external = (raw or {}).get("external", {}) if raw else {}
    out = {"emailPassword": bool(raw) and not (raw or {}).get("disable_signup", False) or bool(raw),
           "google": bool(external.get("google")), "emailConfirmationRequired": not bool((raw or {}).get("mailer_autoconfirm", False)) if raw else True,
           "verified": raw is not None}
    with _cfg_lock:
        _cfg_cache = (time.monotonic(), out)
    return out


def clear_config_cache() -> None:
    global _cfg_cache
    _cfg_cache = None
