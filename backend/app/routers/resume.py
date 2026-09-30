from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from .. import models, security
from ..database import get_db
from ..activity import log_activity
from ..resume_parser import validate_upload, extract_text, parse_resume, ResumeParseError

router = APIRouter(prefix="/api/profile/resume", tags=["resume"])


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    student: models.Student = Depends(security.get_current_student),
):
    content = await file.read()
    try:
        validate_upload(file.filename or "", file.content_type or "", len(content))
        text = extract_text(content, file.content_type)
        if not text.strip():
            raise ResumeParseError("No readable text was found in this file.")
        extracted = parse_resume(text)
    except ResumeParseError as e:
        raise HTTPException(status_code=422, detail={"code": "RESUME_PARSE_FAILED", "message": str(e)})

    new_skills = [s for s in extracted["skills"] if s not in (student.skills or [])]

    return {
        "extracted": {
            "name": extracted["name"],
            "email": extracted["email"],
            "github": extracted["github"],
            "linkedin": extracted["linkedin"],
            "existingSkills": student.skills or [],
            "newSkills": new_skills,
        },
        "method": "heuristic-keyword-match",
    }


class ResumeConfirmIn(BaseModel):
    skillsToAdd: List[str] = []
    updateName: Optional[str] = None


@router.post("/confirm")
def confirm_resume(
    payload: ResumeConfirmIn,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    current_skills = set(student.skills or [])
    for s in payload.skillsToAdd:
        current_skills.add(s)
    student.skills = sorted(current_skills)

    if payload.updateName:
        student.name = payload.updateName

    log_activity(db, student.id, "profile_updated", "Updated profile from resume", link="/profile")
    db.commit()
    db.refresh(student)
    return {"skills": student.skills, "name": student.name}
