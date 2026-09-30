import datetime as dt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from .. import models, security
from ..database import get_db
from ..utils import deadline_urgency
from ..activity import log_activity

router = APIRouter(prefix="/api/applications", tags=["applications"])


class ApplicationCreateIn(BaseModel):
    opportunity_id: str
    status: str = "wishlist"


class ApplicationUpdateIn(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    next_action: Optional[str] = None
    reminder_at: Optional[str] = None  # ISO date


def _serialize(app: models.Application, opp: models.Opportunity | None) -> dict:
    base = {
        "id": app.id, "status": app.status, "notes": app.notes, "nextAction": app.next_action,
        "reminderAt": app.reminder_at.isoformat() if app.reminder_at else None,
        "createdAt": app.created_at.isoformat(), "updatedAt": app.updated_at.isoformat(),
        "opportunityId": app.opportunity_id,
    }
    if opp:
        base.update({
            "title": opp.title, "organization": opp.organization, "domain": opp.domain,
            "externalUrl": opp.external_url, **deadline_urgency(opp.deadline),
        })
    return base


@router.get("")
def list_applications(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    rows = db.query(models.Application).filter(models.Application.student_id == student.id).all()
    items = []
    for a in rows:
        opp = db.query(models.Opportunity).filter(models.Opportunity.id == a.opportunity_id).first()
        items.append(_serialize(a, opp))
    return {"items": items, "total": len(items), "statuses": models.APPLICATION_STATUSES}


@router.post("", status_code=201)
def create_application(
    payload: ApplicationCreateIn,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == payload.opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Opportunity not found"})
    if payload.status not in models.APPLICATION_STATUSES:
        raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": "Invalid application status"})

    existing = db.query(models.Application).filter(
        models.Application.student_id == student.id, models.Application.opportunity_id == payload.opportunity_id,
    ).first()
    if existing:
        return _serialize(existing, opp)

    app = models.Application(student_id=student.id, opportunity_id=payload.opportunity_id, status=payload.status)
    db.add(app)
    db.flush()
    db.add(models.ApplicationEvent(application_id=app.id, kind="created", detail=f"Added to tracker as {payload.status}"))
    log_activity(db, student.id, "application_created", f"Added {opp.title} to tracker", link=f"/opportunities/{opp.id}")
    db.commit()
    db.refresh(app)
    return _serialize(app, opp)


@router.patch("/{application_id}")
def update_application(
    application_id: str,
    payload: ApplicationUpdateIn,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    app = db.query(models.Application).filter(
        models.Application.id == application_id, models.Application.student_id == student.id,
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Application not found"})

    if payload.status is not None:
        if payload.status not in models.APPLICATION_STATUSES:
            raise HTTPException(status_code=400, detail={"code": "INVALID_STATUS", "message": "Invalid application status"})
        if payload.status != app.status:
            db.add(models.ApplicationEvent(application_id=app.id, kind="status_changed", detail=f"{app.status} -> {payload.status}"))
            app.status = payload.status
    if payload.notes is not None:
        app.notes = payload.notes
        db.add(models.ApplicationEvent(application_id=app.id, kind="note_added", detail="Notes updated"))
    if payload.next_action is not None:
        app.next_action = payload.next_action
    if payload.reminder_at is not None:
        app.reminder_at = dt.date.fromisoformat(payload.reminder_at)
        db.add(models.ApplicationEvent(application_id=app.id, kind="reminder_set", detail=f"Reminder set for {payload.reminder_at}"))

    app.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(app)
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == app.opportunity_id).first()
    return _serialize(app, opp)


@router.get("/{application_id}/activity")
def application_activity(
    application_id: str,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    app = db.query(models.Application).filter(
        models.Application.id == application_id, models.Application.student_id == student.id,
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Application not found"})
    events = db.query(models.ApplicationEvent).filter(
        models.ApplicationEvent.application_id == application_id
    ).order_by(models.ApplicationEvent.created_at.asc()).all()
    return {"items": [{"kind": e.kind, "detail": e.detail, "createdAt": e.created_at.isoformat()} for e in events]}
