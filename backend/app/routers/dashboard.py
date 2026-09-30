from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..services import catalog, dashboard as svc, fit as fitsvc

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard", summary="Personalised dashboard — every number is computed from the database")
def dashboard(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return svc.build(db, user.id)


@router.get("/skills/intelligence", summary="Skill gaps → opportunities → team roles → recommended action")
def skill_intelligence(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    s, ctx = fitsvc.load_context(db, user.id)
    rows, _ = catalog.search(db, {}, "relevance", 1, 50, limit_all=1000)
    gaps = svc.skill_gaps(db, user.id, s, ctx, rows, limit=12)
    return {"gaps": gaps, "confirmedSkills": sorted(s.skills), "inferredSkills": sorted(s.inferred_skills), "opportunitiesConsidered": len(rows),
            "method": "A gap counts an opportunity when its fit is ≥ 35 and the skill is required but not confirmed. 'High-fit unlocks' re-scores the opportunity with the skill added and counts those reaching 75+."}
