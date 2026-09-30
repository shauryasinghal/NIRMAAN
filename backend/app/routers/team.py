from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db
from ..engines import team_builder
from ..activity import log_activity

router = APIRouter(prefix="/api/team", tags=["team"])


@router.post("/suggest")
def suggest_team(
    payload: schemas.TeamRequestIn,
    student: models.Student = Depends(security.get_current_student),
    db: Session = Depends(get_db),
):
    candidates = db.query(models.Student).filter(
        models.Student.id != student.id, models.Student.role == "STUDENT"
    ).all()
    result = team_builder.build_team(candidates, payload.target_skills, payload.team_size)

    team_row = models.Team(
        requested_by=student.id,
        target_skills=payload.target_skills,
        member_ids=[m["id"] for m in result["members"]],
        diversity_score=result["diversityScore"],
        coverage_score=result["coverageScore"],
    )
    db.add(team_row)
    log_activity(db, student.id, "team_created", f"Built a team for {', '.join(payload.target_skills[:3])}", link="/team-builder")
    db.commit()

    return {"teamId": team_row.id, **result}
