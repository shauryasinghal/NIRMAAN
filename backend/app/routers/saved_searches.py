"""
Saved searches ("alert me when...").

IMPORTANT / HONEST LIMITATION: this router persists the alert definition and
lets a student manage it (create/list/update/delete) - that part is fully
real and backend-owned, not localStorage. What does NOT exist yet is a
background scheduler that periodically evaluates saved searches against new
or changed opportunities and fires a Notification when one matches. Wiring
that requires a job runner (e.g. APScheduler, Celery beat, or a cron-invoked
script) which is future work - see README. Do not present this feature in
the UI as "you will be notified" without that job running.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from .. import models, security
from ..database import get_db
from ..engines import recommender

router = APIRouter(prefix="/api/saved-searches", tags=["saved-searches"])


class SavedSearchIn(BaseModel):
    name: str
    query: str = ""
    domain: Optional[str] = None
    skill: Optional[str] = None
    min_fit: Optional[float] = None
    enabled: bool = True


def _serialize(s: models.SavedSearch) -> dict:
    return {
        "id": s.id, "name": s.name, "query": s.query, "domain": s.domain, "skill": s.skill,
        "minFit": s.min_fit, "enabled": s.enabled, "createdAt": s.created_at.isoformat(),
    }


@router.get("")
def list_saved_searches(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    rows = db.query(models.SavedSearch).filter(models.SavedSearch.student_id == student.id).all()
    return {"items": [_serialize(s) for s in rows]}


@router.post("", status_code=201)
def create_saved_search(payload: SavedSearchIn, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    row = models.SavedSearch(student_id=student.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.patch("/{search_id}")
def update_saved_search(search_id: str, payload: SavedSearchIn, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    row = db.query(models.SavedSearch).filter(models.SavedSearch.id == search_id, models.SavedSearch.student_id == student.id).first()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Saved search not found"})
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/{search_id}")
def delete_saved_search(search_id: str, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    row = db.query(models.SavedSearch).filter(models.SavedSearch.id == search_id, models.SavedSearch.student_id == student.id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"deleted": True}


@router.post("/{search_id}/evaluate")
def evaluate_saved_search(search_id: str, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    """Real, manual evaluation — runs the alert's filters against the
    student's current real recommendations right now and returns actual
    matches. This is the honest substitute for the background scheduler
    that doesn't exist in this environment (see module docstring)."""
    search = db.query(models.SavedSearch).filter(models.SavedSearch.id == search_id, models.SavedSearch.student_id == student.id).first()
    if not search:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Saved search not found"})

    opportunities = db.query(models.Opportunity).all()
    recs = recommender.recommend(student, opportunities, top_k=50)

    matches = []
    for r in recs:
        if search.domain and r["domain"] != search.domain:
            continue
        if search.skill and search.skill.lower() not in [s.lower() for s in r["skills"]]:
            continue
        if search.min_fit and r["fitScore"] < search.min_fit:
            continue
        matches.append(r)

    return {"searchId": search_id, "evaluatedAt": "now", "matchCount": len(matches), "items": matches[:10]}
