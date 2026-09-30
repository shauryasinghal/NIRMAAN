"""
Google OAuth 2.0 (Authorization Code flow) for "Continue with Google" login
and the separately-consented Calendar connection.

Configuration (see .env.example): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
GOOGLE_REDIRECT_URI. If these are unset, `is_configured()` returns False and
every route in routers/google_auth.py responds with a clear
"not configured" error instead of a broken/fake login button - see Phase 8
requirement to gracefully disable rather than fake OAuth.

Identity verification approach: after exchanging the authorization code for
an access token, we call Google's own `userinfo` endpoint with that token
over TLS - Google validates the token server-side, so a successful response
is genuine proof of identity. This is a standard, secure pattern. Full local
ID-token signature verification (via the `google-auth` library and Google's
JWKS) is the more defense-in-depth alternative and is not implemented here
to avoid an extra heavy dependency - documented honestly, not hidden.
"""
import os
import httpx

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"

LOGIN_SCOPES = "openid email profile"
CALENDAR_SCOPES = "openid email profile https://www.googleapis.com/auth/calendar.events"


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)


def build_authorization_url(state: str, scopes: str = LOGIN_SCOPES, prompt_consent: bool = False) -> str:
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": scopes,
        "state": state,
        "access_type": "offline" if "calendar" in scopes else "online",
    }
    if prompt_consent:
        params["prompt"] = "consent"
    query = "&".join(f"{k}={httpx.QueryParams({k: v})[k]}" for k, v in params.items())
    return f"{AUTH_ENDPOINT}?{query}"


def exchange_code_for_tokens(code: str) -> dict:
    resp = httpx.post(TOKEN_ENDPOINT, data={
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": GOOGLE_REDIRECT_URI,
    }, timeout=10.0)
    resp.raise_for_status()
    return resp.json()


def fetch_userinfo(access_token: str) -> dict:
    resp = httpx.get(USERINFO_ENDPOINT, headers={"Authorization": f"Bearer {access_token}"}, timeout=10.0)
    resp.raise_for_status()
    return resp.json()  # {sub, email, name, picture, email_verified, ...}
