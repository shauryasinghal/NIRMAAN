from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from .. import models, security
from ..database import get_db
from ..engines import recommender
from ..utils import deadline_urgency

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


def _trust_fields(o: models.Opportunity) -> dict:
    return {
        "category": o.category,
        "participation": o.participation,
        "minTeamSize": o.min_team_size,
        "maxTeamSize": o.max_team_size,
        "sourceType": o.source_type,
        "updatedAt": o.updated_at.isoformat() if o.updated_at else None,
    }


@router.get("")
def list_opportunities(
    domain: Optional[str] = None,
    skill: Optional[str] = None,
    category: Optional[str] = None,
    format: Optional[str] = None,
    participation: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.Opportunity)
    if domain:
        q = q.filter(models.Opportunity.domain == domain)
    if category:
        q = q.filter(models.Opportunity.category == category)
    if format:
        q = q.filter(models.Opportunity.format == format)
    if participation:
        q = q.filter(models.Opportunity.participation == participation)
    items = q.all()
    if skill:
        items = [o for o in items if skill.lower() in [s.lower() for s in o.required_skills]]

    total = len(items)
    page = items[offset: offset + limit]

    return {
        "items": [
            {
                "id": o.id, "title": o.title, "organization": o.organization, "domain": o.domain,
                "skills": o.required_skills, "format": o.format, "source": o.source,
                "externalUrl": o.external_url, **_trust_fields(o), **deadline_urgency(o.deadline),
            }
            for o in page
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    """Real, derived from the actual seeded/ingested data — never a static hardcoded list."""
    rows = db.query(models.Opportunity.category).distinct().all()
    return {"items": sorted(r[0] for r in rows if r[0])}


@router.get("/recommend")
def recommend_opportunities(
    top_k: int = Query(10, alias="topK"),
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    opportunities = db.query(models.Opportunity).all()
    items = recommender.recommend(student, opportunities, top_k=top_k)
    opp_by_id = {o.id: o for o in opportunities}
    for item in items:
        item.update(_trust_fields(opp_by_id[item["id"]]))
    for rank, item in enumerate(items, start=1):
        db.add(models.RecommendationLog(
            student_id=student.id, opportunity_id=item["id"],
            fit_score=item["fitScore"], rank=rank,
        ))
    db.commit()
    return {"items": items, "total": len(items)}


@router.get("/{opportunity_id}")
def get_opportunity(opportunity_id: str, db: Session = Depends(get_db)):
    o = db.query(models.Opportunity).filter(models.Opportunity.id == opportunity_id).first()
    if not o:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Opportunity not found"})
    return {
        "id": o.id, "title": o.title, "organization": o.organization, "domain": o.domain,
        "skills": o.required_skills, "description": o.description,
        "format": o.format, "difficulty": o.difficulty, "source": o.source,
        "externalUrl": o.external_url, **_trust_fields(o), **deadline_urgency(o.deadline),
    }
