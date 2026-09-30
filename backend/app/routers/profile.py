from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db
from ..activity import log_activity

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _completeness(student: models.Student) -> bool:
    return bool(student.skills) and bool(student.interests) and bool(student.branch)


@router.get("", response_model=schemas.ProfileOut)
def get_profile(student: models.Student = Depends(security.get_current_student)):
    return schemas.ProfileOut(
        id=student.id, name=student.name, email=student.email,
        year=student.year, branch=student.branch, skills=student.skills or [],
        interests=student.interests or [], experience_level=student.experience_level,
        availability_hrs=student.availability_hrs, profile_complete=student.profile_complete,
    )


@router.put("", response_model=schemas.ProfileOut)
def update_profile(
    payload: schemas.ProfileIn,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    student.year = payload.year
    student.branch = payload.branch
    student.skills = payload.skills
    student.interests = payload.interests
    student.experience_level = payload.experience_level
    student.availability_hrs = payload.availability_hrs
    student.profile_complete = _completeness(student)
    log_activity(db, student.id, "profile_updated", "Updated profile", link="/profile")
    db.commit()
    db.refresh(student)
    return schemas.ProfileOut(
        id=student.id, name=student.name, email=student.email,
        year=student.year, branch=student.branch, skills=student.skills or [],
        interests=student.interests or [], experience_level=student.experience_level,
        availability_hrs=student.availability_hrs, profile_complete=student.profile_complete,
    )
