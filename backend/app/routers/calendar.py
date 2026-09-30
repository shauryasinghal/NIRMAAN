import datetime as dt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from jose import jwt, JWTError
from sqlalchemy.orm import Session
import httpx

from .. import models, security, google_oauth
from ..database import get_db
from ..ics import build_ics

router = APIRouter(tags=["calendar"])


@router.get("/api/opportunities/{opportunity_id}/calendar.ics")
def download_ics(opportunity_id: str, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    """Real, works today for every user - no Google OAuth required."""
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Opportunity not found"})
    if not opp.deadline:
        raise HTTPException(status_code=400, detail={"code": "NO_DEADLINE", "message": "This opportunity has no deadline to export"})

    ics_content = build_ics(opp.title, opp.description or "", opp.deadline, opp.external_url)
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="{opp.title[:40].replace(" ", "-")}-deadline.ics"'},
    )


# ---- Optional Google Calendar connection (separate consent from login) ----

@router.get("/api/integrations/google/calendar/status")
def calendar_status(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    connected = db.query(models.GoogleAccount).filter(models.GoogleAccount.student_id == student.id).first() is not None
    return {"configured": google_oauth.is_configured(), "connected": connected}


@router.get("/api/integrations/google/calendar/connect")
def calendar_connect(student: models.Student = Depends(security.get_current_student)):
    if not google_oauth.is_configured():
        raise HTTPException(status_code=503, detail={"code": "GOOGLE_NOT_CONFIGURED", "message": "Google Calendar is not configured in this environment."})
    state = jwt.encode(
        {"purpose": "calendar_connect", "studentId": student.id, "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)},
        security.SECRET_KEY, algorithm="HS256",
    )
    url = google_oauth.build_authorization_url(state, scopes=google_oauth.CALENDAR_SCOPES, prompt_consent=True)
    return {"authorizationUrl": url}


@router.get("/api/integrations/google/calendar/callback")
def calendar_callback(code: str = Query(...), state: str = Query(...), db: Session = Depends(get_db)):
    if not google_oauth.is_configured():
        raise HTTPException(status_code=503, detail={"code": "GOOGLE_NOT_CONFIGURED", "message": "Google Calendar is not configured."})
    try:
        payload = jwt.decode(state, security.SECRET_KEY, algorithms=["HS256"])
        if payload.get("purpose") != "calendar_connect":
            raise ValueError()
        student_id = payload["studentId"]
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=400, detail={"code": "INVALID_OAUTH_STATE", "message": "Calendar connection link is invalid or expired."})

    try:
        tokens = google_oauth.exchange_code_for_tokens(code)
    except Exception:
        raise HTTPException(status_code=502, detail={"code": "GOOGLE_OAUTH_FAILED", "message": "Could not connect Google Calendar. Please try again."})

    expires_in = tokens.get("expires_in", 3600)
    existing = db.query(models.GoogleAccount).filter(models.GoogleAccount.student_id == student_id).first()
    if not existing:
        existing = models.GoogleAccount(student_id=student_id)
        db.add(existing)
    existing.access_token = tokens.get("access_token")
    if tokens.get("refresh_token"):
        existing.refresh_token = tokens.get("refresh_token")
    existing.token_expires_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=expires_in)
    existing.scopes = google_oauth.CALENDAR_SCOPES.split()
    db.commit()
    return {"connected": True}


@router.delete("/api/integrations/google/calendar")
def disconnect_calendar(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    row = db.query(models.GoogleAccount).filter(models.GoogleAccount.student_id == student.id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"connected": False}


@router.post("/api/opportunities/{opportunity_id}/calendar-event")
def create_calendar_event(opportunity_id: str, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    """Creates a REAL event in the student's Google Calendar via the Calendar
    API, using the token captured during /connect. Only reachable if a
    connection actually exists - otherwise 400 with a clear message pointing
    at the .ics download instead of pretending this worked."""
    account = db.query(models.GoogleAccount).filter(models.GoogleAccount.student_id == student.id).first()
    if not account:
        raise HTTPException(status_code=400, detail={
            "code": "CALENDAR_NOT_CONNECTED",
            "message": "Google Calendar isn't connected. Use the .ics download instead, or connect Calendar in Settings.",
        })
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp or not opp.deadline:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Opportunity or deadline not found"})

    resp = httpx.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={"Authorization": f"Bearer {account.access_token}"},
        json={
            "summary": f"Deadline: {opp.title}",
            "description": opp.description or "",
            "start": {"date": opp.deadline.isoformat()},
            "end": {"date": (opp.deadline + dt.timedelta(days=1)).isoformat()},
        },
        timeout=10.0,
    )
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "CALENDAR_TOKEN_EXPIRED", "message": "Your Google Calendar connection expired — reconnect in Settings."})
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail={"code": "CALENDAR_EVENT_FAILED", "message": "Could not create the calendar event."})
    return {"created": True, "eventUrl": resp.json().get("htmlLink")}
