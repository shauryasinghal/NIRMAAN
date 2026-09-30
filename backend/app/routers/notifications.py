from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, security
from ..database import get_db

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    rows = db.query(models.Notification).filter(
        models.Notification.student_id == student.id
    ).order_by(models.Notification.created_at.desc()).all()
    unread = sum(1 for r in rows if not r.read)
    return {
        "items": [
            {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "link": n.link,
             "read": n.read, "createdAt": n.created_at.isoformat()}
            for n in rows
        ],
        "unreadCount": unread,
    }


@router.patch("/{notification_id}/read")
def mark_read(notification_id: str, student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    n = db.query(models.Notification).filter(
        models.Notification.id == notification_id, models.Notification.student_id == student.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Notification not found"})
    n.read = True
    db.commit()
    return {"id": n.id, "read": True}


@router.post("/read-all")
def mark_all_read(student: models.Student = Depends(security.get_current_student), db: Session = Depends(get_db)):
    db.query(models.Notification).filter(
        models.Notification.student_id == student.id, models.Notification.read == False,  # noqa: E712
    ).update({"read": True})
    db.commit()
    return {"ok": True}
