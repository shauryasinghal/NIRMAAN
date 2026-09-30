import datetime as dt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/api/reviewer", tags=["reviewer"])


@router.get("/queue")
def review_queue(
    reviewer: models.Student = Depends(security.require_reviewer),
    db: Session = Depends(get_db),
):
    pending = db.query(models.Review).filter(models.Review.decision.is_(None)).all()
    out = []
    for r in pending:
        idea = db.query(models.IdeaSubmission).filter(models.IdeaSubmission.id == r.idea_id).first()
        if idea:
            out.append({
                "reviewId": r.id, "ideaId": idea.id, "title": idea.title,
                "description": idea.description, "topSimilarity": idea.top_similarity,
                "matches": idea.matches, "submittedAt": idea.created_at.isoformat(),
            })
    return {"items": out}


@router.post("/{review_id}/decision")
def make_decision(
    review_id: str,
    payload: schemas.ReviewDecisionIn,
    reviewer: models.Student = Depends(security.require_reviewer),
    db: Session = Depends(get_db),
):
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Review not found"})
    if payload.decision not in ("confirm_overlap", "dismiss", "needs_review"):
        raise HTTPException(status_code=400, detail={"code": "INVALID_DECISION", "message": "invalid decision value"})

    review.decision = payload.decision
    review.reviewer_id = reviewer.id
    review.reviewed_at = dt.datetime.now(dt.timezone.utc)

    idea = db.query(models.IdeaSubmission).filter(models.IdeaSubmission.id == review.idea_id).first()
    if idea:
        idea.status = {"confirm_overlap": "confirmed_overlap", "dismiss": "novel",
                        "needs_review": "needs_review"}[payload.decision]
    db.commit()
    return {"reviewId": review.id, "decision": review.decision}
