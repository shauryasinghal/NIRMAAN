from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, security
from ..database import get_db
from ..engines import recommender, why_not, next_best_action, skill_gaps, application_intelligence
from ..routers.applications import _serialize as serialize_application

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


def _get_recommendations(db: Session, student: models.Student, top_k: int = 50):
    opportunities = db.query(models.Opportunity).all()
    return recommender.recommend(student, opportunities, top_k=top_k), opportunities


@router.get("/next-best-action")
def get_next_best_action(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    recs, _ = _get_recommendations(db, student)
    saved_count = db.query(models.SavedOpportunity).filter(models.SavedOpportunity.student_id == student.id).count()
    apps = db.query(models.Application).filter(models.Application.student_id == student.id).all()
    app_dicts = []
    for a in apps:
        opp = db.query(models.Opportunity).filter(models.Opportunity.id == a.opportunity_id).first()
        app_dicts.append(serialize_application(a, opp))
    idea_count = db.query(models.IdeaSubmission).filter(models.IdeaSubmission.student_id == student.id).count()

    action = next_best_action.compute_next_best_action(
        recs, saved_count, app_dicts, idea_count, profile_complete=student.profile_complete,
    )
    return {"action": action}


@router.get("/skill-gaps")
def get_skill_gaps(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    recs, _ = _get_recommendations(db, student)
    return {"items": skill_gaps.compute_skill_gaps(recs)}


@router.get("/why-not/{opportunity_id}")
def get_why_not(opportunity_id: str, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    opp = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Opportunity not found"})
    recs, _ = _get_recommendations(db, student)
    match = next((r for r in recs if r["id"] == opportunity_id), None)
    if not match:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "No fit computed for this opportunity"})
    return why_not.explain_low_fit(student, opp, match["fitScore"], match["matchedSkills"], match["missingSkills"])


@router.get("/application-insights")
def get_application_insights(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    apps = db.query(models.Application).filter(models.Application.student_id == student.id).all()
    app_dicts = []
    for a in apps:
        opp = db.query(models.Opportunity).filter(models.Opportunity.id == a.opportunity_id).first()
        app_dicts.append(serialize_application(a, opp))
    return {"items": application_intelligence.compute_application_insights(app_dicts)}
