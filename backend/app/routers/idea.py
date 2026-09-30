from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db
from ..engines import originality
from ..activity import log_activity, notify

router = APIRouter(prefix="/api/idea", tags=["idea"])


@router.post("/check")
def check_idea(
    payload: schemas.IdeaCheckIn,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    corpus = db.query(models.PriorIdea).all()
    result = originality.check_originality(payload.title, payload.description, corpus)

    submission = models.IdeaSubmission(
        student_id=student.id, title=payload.title, description=payload.description,
        domain=payload.domain, novelty_score=result["noveltyScore"],
        top_similarity=result["topSimilarity"], status=result["status"],
        matches=result["matches"],
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # High-similarity cases are queued for reviewer sign-off before the
    # student-visible status becomes a duplication flag.
    if result["status"] == "needs_review":
        db.add(models.Review(idea_id=submission.id, reviewer_id=None))
        notify(
            db, student.id, "originality_review",
            "Your idea was flagged for human review",
            body=f'"{payload.title}" had a high similarity match and is queued for reviewer sign-off.',
            link="/originality/history",
        )

    log_activity(db, student.id, "idea_checked", f"Checked originality of \"{payload.title}\"", link="/originality/history")
    db.commit()

    return {
        "ideaId": submission.id,
        "noveltyScore": result["noveltyScore"],
        "matches": result["matches"],
        "status": submission.status,
        "embeddingMode": result["embeddingMode"],
        "searchBackend": result["searchBackend"],
    }


@router.get("/history/{idea_id}")
def idea_detail(
    idea_id: str,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    r = db.query(models.IdeaSubmission).filter(
        models.IdeaSubmission.id == idea_id, models.IdeaSubmission.student_id == student.id,
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Idea check not found"})
    review = db.query(models.Review).filter(models.Review.idea_id == r.id).first()
    return {
        "id": r.id, "title": r.title, "description": r.description, "domain": r.domain,
        "date": r.created_at.isoformat(), "noveltyScore": r.novelty_score, "status": r.status,
        "topSimilarity": r.top_similarity, "matches": r.matches,
        "reviewStatus": review.decision if review else None,
        "reviewedAt": review.reviewed_at.isoformat() if review and review.reviewed_at else None,
    }


@router.delete("/history/{idea_id}")
def delete_idea(
    idea_id: str,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    r = db.query(models.IdeaSubmission).filter(
        models.IdeaSubmission.id == idea_id, models.IdeaSubmission.student_id == student.id,
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Idea check not found"})
    db.query(models.Review).filter(models.Review.idea_id == r.id).delete()
    db.delete(r)
    db.commit()
    return {"deleted": True}


@router.get("/history")
def idea_history(
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    rows = db.query(models.IdeaSubmission).filter(
        models.IdeaSubmission.student_id == student.id
    ).order_by(models.IdeaSubmission.created_at.desc()).all()
    return {"items": [
        {"id": r.id, "title": r.title, "date": r.created_at.isoformat(),
         "noveltyScore": r.novelty_score, "status": r.status,
         "topSimilarity": r.top_similarity}
        for r in rows
    ]}
