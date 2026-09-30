import datetime as dt
import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.fernet import Fernet

from app.core.config import reset_settings_cache
from app.integrations import google as g


@pytest.fixture()
def google(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid.apps.googleusercontent.com"); monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "csecret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/integrations/google/callback"); monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    reset_settings_cache()
    calls = []

    def handler(req: httpx.Request):
        body = req.content.decode()
        calls.append((str(req.url), body, dict(req.headers)))
        if req.url.host == "oauth2.googleapis.com" and req.url.path == "/token":
            if "grant_type=authorization_code" in body:
                return httpx.Response(200, json={"access_token": "ya29.ACCESS", "refresh_token": "1//REFRESH", "expires_in": 3600, "scope": "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send"})
            return httpx.Response(200, json={"access_token": "ya29.FRESH", "expires_in": 3600})
        if req.url.path == "/revoke":
            return httpx.Response(200)
        if "calendar/v3" in str(req.url):
            return httpx.Response(200, json={"id": "evt1", "htmlLink": "https://calendar.google.com/event?eid=1"})
        if "gmail.googleapis.com" in str(req.url):
            return httpx.Response(200, json={"id": "msg1"})
        return httpx.Response(404)
    g._http_factory = lambda: httpx.Client(transport=httpx.MockTransport(handler))
    yield calls
    g._http_factory = lambda: httpx.Client(timeout=10.0)
    for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "TOKEN_ENCRYPTION_KEY"):
        monkeypatch.setenv(k, "")
    reset_settings_cache()


def connect(client, u, provider="calendar"):
    url = client.post(f"/api/integrations/google/{provider}/connect", headers=u.h).json()["authorizationUrl"]
    q = parse_qs(urlparse(url).query)
    return client.post("/api/integrations/google/callback", headers=u.h, json={"code": "authcode", "state": q["state"][0], "provider": provider}), q


def test_disabled_gracefully_when_not_configured(client, student):
    s = client.get("/api/integrations", headers=student.h).json()
    assert s["enabled"] is False and s["calendar"]["connected"] is False and "Not configured" in s["reason"]
    r = client.post("/api/integrations/google/calendar/connect", headers=student.h)
    assert r.status_code == 503 and r.json()["error"]["details"]["reason"] == "google_not_configured"
    assert client.post("/api/integrations/google/calendar/events", headers=student.h, json={"opportunityId": "x", "confirm": True}).status_code == 503


def test_connect_flow_uses_minimum_scopes_and_encrypts_tokens(client, student, google, svc):
    r, q = connect(client, student, "calendar")
    assert q["scope"] == ["https://www.googleapis.com/auth/calendar.events"] and q["access_type"] == ["offline"] and q["response_type"] == ["code"]
    assert "password" not in json.dumps(q).lower()
    assert r.status_code == 200 and r.json()["scopes"] == ["https://www.googleapis.com/auth/calendar.events"]
    row = svc.one("select access_token_enc, refresh_token_enc from public.oauth_connections where profile_id = cast(:u as uuid)", u=student.id)
    assert "ya29.ACCESS" not in row["access_token_enc"] and "1//REFRESH" not in row["refresh_token_enc"]          # ciphertext at rest
    st = client.get("/api/integrations", headers=student.h).json()
    assert st["enabled"] is True and st["calendar"]["connected"] is True and st["gmail"]["connected"] is False
    assert "ya29" not in json.dumps(st) and "REFRESH" not in json.dumps(st)
    assert any("csecret" in body for _, body, _ in google) is True          # the secret only ever goes to Google's token endpoint


def test_state_is_bound_to_user_provider_and_time(client, student, student2, google):
    url = client.post("/api/integrations/google/calendar/connect", headers=student.h).json()["authorizationUrl"]
    state = parse_qs(urlparse(url).query)["state"][0]
    body = {"code": "c", "state": state, "provider": "calendar"}
    assert client.post("/api/integrations/google/callback", headers=student2.h, json=body).status_code == 400                       # another account
    assert client.post("/api/integrations/google/callback", headers=student.h, json={**body, "provider": "gmail"}).status_code == 400    # other provider
    assert client.post("/api/integrations/google/callback", headers=student.h, json={**body, "state": "forged"}).status_code == 400
    import jwt as pyjwt
    from app.integrations.google import _state_key
    expired = pyjwt.encode({"sub": student.id, "prv": "google_calendar", "purpose": "google_oauth", "exp": dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)}, _state_key(), algorithm="HS256")
    assert client.post("/api/integrations/google/callback", headers=student.h, json={**body, "state": expired}).status_code == 400
    assert client.get("/api/integrations", headers=student2.h).json()["calendar"]["connected"] is False


def test_denied_scope_is_not_stored(client, student, google, monkeypatch):
    def deny(req):
        return httpx.Response(200, json={"access_token": "a", "refresh_token": "r", "expires_in": 3600, "scope": "openid"})
    g._http_factory = lambda: httpx.Client(transport=httpx.MockTransport(deny))
    r, _ = connect(client, student)
    assert r.status_code == 400 and r.json()["error"]["details"]["reason"] == "scope_denied"
    assert client.get("/api/integrations", headers=student.h).json()["calendar"]["connected"] is False


def test_calendar_event_requires_explicit_confirmation(client, student, google, catalog):
    connect(client, student)
    o = client.get("/api/opportunities?sort=deadline&page_size=1", headers=student.h).json()["items"][0]
    before = len(google)
    r = client.post("/api/integrations/google/calendar/events", headers=student.h, json={"opportunityId": o["id"]})
    assert r.status_code == 400 and r.json()["error"]["details"]["reason"] == "confirmation_required" and len(google) == before      # nothing sent to Google
    ok = client.post("/api/integrations/google/calendar/events", headers=student.h, json={"opportunityId": o["id"], "confirm": True})
    assert ok.status_code == 200 and ok.json()["eventId"] == "evt1"
    cal = [c for c in google if "calendar/v3" in c[0]][-1]
    payload = json.loads(cal[1])
    assert payload["summary"].startswith("Deadline:") and payload["start"]["date"] == o["deadline"] and cal[2]["authorization"] == "Bearer ya29.ACCESS"
    assert client.post("/api/integrations/google/calendar/events", headers=student.h, json={"opportunityId": "nope", "confirm": True}).status_code == 404


def test_not_connected_and_refresh_and_disconnect(client, student, student2, google, catalog, svc):
    o = client.get("/api/opportunities?sort=deadline&page_size=1", headers=student.h).json()["items"][0]
    assert client.post("/api/integrations/google/calendar/events", headers=student2.h, json={"opportunityId": o["id"], "confirm": True}).json()["error"]["details"]["reason"] == "not_connected"
    connect(client, student)
    svc.run("update public.oauth_connections set expires_at = now() - interval '1 hour' where profile_id = cast(:u as uuid)", u=student.id)
    assert client.post("/api/integrations/google/calendar/events", headers=student.h, json={"opportunityId": o["id"], "confirm": True}).status_code == 200
    assert [c for c in google if "calendar/v3" in c[0]][-1][2]["authorization"] == "Bearer ya29.FRESH"                # refreshed server-side
    assert client.delete("/api/integrations/google/calendar", headers=student2.h).status_code == 404
    assert client.delete("/api/integrations/google/calendar", headers=student.h).status_code == 204
    assert svc.val("select count(*) from public.oauth_connections where profile_id = cast(:u as uuid)", u=student.id) == 0
    assert any("/revoke" in c[0] for c in google)


def test_gmail_reminder_goes_only_to_the_users_own_address_and_needs_confirmation(client, student, google, catalog):
    connect(client, student, "gmail")
    o = client.get("/api/opportunities?sort=deadline&page_size=1", headers=student.h).json()["items"][0]
    assert client.post("/api/integrations/google/gmail/send-reminder", headers=student.h, json={"opportunityId": o["id"]}).status_code == 400
    r = client.post("/api/integrations/google/gmail/send-reminder", headers=student.h, json={"opportunityId": o["id"], "confirm": True, "to": "victim@example.com"})
    assert r.status_code == 200 and r.json()["messageId"] == "msg1"
    import base64
    raw = base64.urlsafe_b64decode(json.loads([c for c in google if "gmail.googleapis.com" in c[0]][-1][1])["raw"]).decode()
    assert raw.startswith(f"To: {student.email}\r\n") and "victim@example.com" not in raw


def test_ics_export_is_valid_and_needs_no_oauth(client, student, catalog):
    o = client.get("/api/opportunities?sort=deadline&page_size=1", headers=student.h).json()["items"][0]
    r = client.get(f"/api/opportunities/{o['id']}/calendar.ics", headers=student.h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    b = r.text
    assert b.startswith("BEGIN:VCALENDAR\r\n") and f"UID:{o['id']}@nirmaan" in b and f"DTSTART;VALUE=DATE:{o['deadline'].replace('-', '')}" in b and "BEGIN:VALARM" in b
    assert "http" not in b.split("DESCRIPTION:")[1].split("\r\n")[0]          # demo listings never leak an outbound link
    assert client.get(f"/api/opportunities/00000000-0000-0000-0000-000000000000/calendar.ics", headers=student.h).status_code == 404
