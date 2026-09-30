from sqlalchemy.orm import Session
from . import models


def log_activity(db: Session, student_id: str, kind: str, title: str, link: str | None = None):
    """Every call site here corresponds to something that actually happened —
    never call this to synthesize activity that didn't occur."""
    db.add(models.ActivityEvent(student_id=student_id, kind=kind, title=title, link=link))


def notify(db: Session, student_id: str, kind: str, title: str, body: str = "", link: str | None = None):
    """Creates a real, persisted notification. There is currently no background
    scheduler - notifications are created synchronously at the moment a
    triggering action happens (e.g. an idea is flagged), not on a timer.
    Deadline-based and saved-search alerts need a scheduled job to fire
    without a user action; that job does not exist yet (see routers/saved_searches.py)."""
    db.add(models.Notification(student_id=student_id, kind=kind, title=title, body=body, link=link))
