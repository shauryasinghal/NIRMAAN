from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Response

from ..core.errors import bad_request, not_found
from ..core.middleware import rate_limit
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..integrations import google as g
from ..schemas.common import ApiModel
from ..services import catalog
from ..services.activity import log_activity
from ..services.common import parse_uuid

router = APIRouter(prefix="/api/integrations", tags=["integrations"])
Provider = Literal["calendar", "gmail"]


class CallbackIn(ApiModel):
    code: str
    state: str
    provider: Provider


class WriteIn(ApiModel):
    opportunity_id: str
    confirm: bool = False


@router.get("", summary="What is connected (and whether Google integrations exist on this server at all)")
def status(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return g.status(db, user.id)


@router.post("/google/{provider}/connect", summary="Start an optional Google connection (returns the Google consent URL)")
def connect(provider: Provider, user: CurrentUser = Depends(require_student)):
    g.require_enabled()
    return {"authorizationUrl": g.authorization_url(user.id, g.PROVIDERS[provider]), "scope": g.SCOPES[g.PROVIDERS[provider]]}


@router.post("/google/callback", dependencies=[Depends(rate_limit("oauth-cb", 10))])
def callback(body: CallbackIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    g.require_enabled()
    prov = g.PROVIDERS[body.provider]
    g.check_state(body.state, user.id, prov)
    out = g.exchange_and_store(db, user.id, prov, body.code)
    log_activity(db, user.id, "integration_connected", f"Connected {'Google Calendar' if body.provider == 'calendar' else 'Gmail'}", "/settings")
    return out


@router.delete("/google/{provider}", status_code=204)
def disconnect(provider: Provider, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    if not g.disconnect(db, user.id, g.PROVIDERS[provider]):
        raise not_found("Connection")
    return Response(status_code=204)


def _opp(db: Db, opportunity_id: str) -> dict:
    o = catalog.get_one(db, parse_uuid(opportunity_id, "opportunity"))
    if not o:
        raise not_found("Opportunity")
    if not o["deadline"]:
        raise bad_request("This opportunity has no deadline to plan around.")
    return o


@router.post("/google/calendar/events", summary="Create a deadline event — only with confirm=true")
def create_event(body: WriteIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    g.require_enabled()
    if not body.confirm:
        raise bad_request("Nothing was added. Confirm to create this calendar event.", {"reason": "confirmation_required"})
    o = _opp(db, body.opportunity_id)
    out = g.create_deadline_event(db, user.id, o["title"], o["deadline"], f"{o['title']} · {o['organization']}", None if o["source_type"] == "dev_seed" else o["external_url"])
    log_activity(db, user.id, "calendar_event_created", f"Added the {o['title']} deadline to Google Calendar", f"/opportunities/{o['id']}")
    return out


@router.post("/google/gmail/send-reminder", summary="Email yourself a deadline reminder — only with confirm=true")
def send_reminder(body: WriteIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    g.require_enabled()
    if not body.confirm:
        raise bad_request("Nothing was sent. Confirm to email yourself this reminder.", {"reason": "confirmation_required"})
    o = _opp(db, body.opportunity_id)
    return g.send_reminder_email(db, user.id, user.email, f"NIRMAAN reminder: {o['title']}", f"{o['title']} ({o['organization']}) closes on {o['deadline']}.")
