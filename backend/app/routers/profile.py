from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from ..core.errors import not_found
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.common import ApiModel
from ..schemas.profile import ProfileOut, ProfileUpdate
from ..services import profiles as svc
from ..services.activity import log_activity

router = APIRouter(prefix="/api", tags=["profile"])


@router.get("/profile", response_model=ProfileOut)
def get_profile(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return svc.get_profile(db, user.id)


@router.put("/profile", response_model=ProfileOut, summary="Update your own profile (role/email/id are not writable)")
def update_profile(body: ProfileUpdate, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    svc.update_profile(db, user.id, body.model_dump(exclude_unset=True))
    log_activity(db, user.id, "profile_updated", "Updated profile", "/profile")
    return svc.get_profile(db, user.id)


@router.post("/profile/skills/{name}/confirm", response_model=ProfileOut, summary="Explicitly confirm an inferred skill")
def confirm_skill(name: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    if not svc.confirm_inferred_skill(db, user.id, name):
        raise not_found("Inferred skill")
    log_activity(db, user.id, "profile_updated", f"Confirmed skill: {name.lower()}", "/profile")
    return svc.get_profile(db, user.id)


@router.delete("/profile/skills/{name}", status_code=204, summary="Remove a skill (confirmed or inferred)")
def delete_skill(name: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    if not svc.remove_skill(db, user.id, name):
        raise not_found("Skill")
    return Response(status_code=204)


class VocabItem(ApiModel):
    slug: str
    name: str


@router.get("/skills", response_model=list[VocabItem], tags=["skills"])
def skills(db: Db = Depends(get_db)):
    return db.all("select slug, name from public.skills order by name")


@router.get("/interests", response_model=list[VocabItem], tags=["skills"])
def interests(db: Db = Depends(get_db)):
    return db.all("select slug, name from public.interests order by name")
