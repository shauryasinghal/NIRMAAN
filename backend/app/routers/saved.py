from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, security
from ..database import get_db
from ..utils import deadline_urgency
from ..activity import log_activity

router = APIRouter(prefix="/api", tags=["saved"])


@router.post("/opportunities/{opportunity_id}/save", status_code=201)
def save_opportunity(
    opportunity_id: str,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Opportunity not found"})

    existing = db.query(models.SavedOpportunity).filter(
        models.SavedOpportunity.student_id == student.id,
        models.SavedOpportunity.opportunity_id == opportunity_id,
    ).first()
    if existing:
        return {"saved": True, "id": existing.id}

    row = models.SavedOpportunity(student_id=student.id, opportunity_id=opportunity_id)
    db.add(row)
    log_activity(db, student.id, "opportunity_saved", f"Saved {opp.title}", link=f"/opportunities/{opp.id}")
    db.commit()
    return {"saved": True, "id": row.id}


@router.delete("/opportunities/{opportunity_id}/save", status_code=200)
def unsave_opportunity(
    opportunity_id: str,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    row = db.query(models.SavedOpportunity).filter(
        models.SavedOpportunity.student_id == student.id,
        models.SavedOpportunity.opportunity_id == opportunity_id,
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"saved": False}


@router.get("/saved-opportunities")
def list_saved_opportunities(
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    rows = db.query(models.SavedOpportunity).filter(
        models.SavedOpportunity.student_id == student.id
    ).order_by(models.SavedOpportunity.saved_at.desc()).all()

    items = []
    for row in rows:
        opp = db.query(models.Opportunity).filter(models.Opportunity.id == row.opportunity_id).first()
        if not opp:
            continue
        items.append({
            "id": opp.id, "title": opp.title, "organization": opp.organization, "domain": opp.domain,
            "skills": opp.required_skills, "format": opp.format, "source": opp.source,
            "externalUrl": opp.external_url, "savedAt": row.saved_at.isoformat(),
            **deadline_urgency(opp.deadline),
        })
    return {"items": items, "total": len(items)}


@router.get("/opportunities/{opportunity_id}/saved")
def is_saved(
    opportunity_id: str,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    exists = db.query(models.SavedOpportunity).filter(
        models.SavedOpportunity.student_id == student.id,
        models.SavedOpportunity.opportunity_id == opportunity_id,
    ).first() is not None
    return {"saved": exists}
