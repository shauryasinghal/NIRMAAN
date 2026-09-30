from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models, security
from ..database import get_db

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("")
def list_activity(
    limit: int = Query(30, ge=1, le=100),
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    rows = db.query(models.ActivityEvent).filter(
        models.ActivityEvent.student_id == student.id
    ).order_by(models.ActivityEvent.created_at.desc()).limit(limit).all()
    return {"items": [
        {"id": e.id, "kind": e.kind, "title": e.title, "link": e.link, "createdAt": e.created_at.isoformat()}
        for e in rows
    ]}
