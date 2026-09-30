from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import ConfigDict, Field

from ..core.errors import not_found
from ..core.middleware import rate_limit
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.common import ApiModel
from ..services import ideas as svc
from ..services.common import parse_uuid

router = APIRouter(prefix="/api", tags=["originality"])


class CheckIn(ApiModel):
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=20, max_length=5000)
    domain: Optional[str] = Field(None, max_length=80)
    opportunity_id: Optional[str] = None


@router.post("/originality/check", status_code=201, summary="Analyse an idea against the comparison corpus (pgvector)",
             dependencies=[Depends(rate_limit("originality", 12))])
def check(body: CheckIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    opp = parse_uuid(body.opportunity_id, "opportunity") if body.opportunity_id else None
    if opp and not db.val("select 1 from public.opportunities where id = cast(:o as uuid)", o=opp):
        raise not_found("Opportunity")
    return svc.check(db, user.id, body.title, body.description, body.domain, opp)


@router.get("/ideas", summary="My checked ideas")
def list_ideas(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return {"items": svc.history(db, user.id)}


@router.get("/ideas/{idea_id}")
def get_idea(idea_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    r = svc.get_idea(db, user.id, parse_uuid(idea_id, "idea"))
    if not r:
        raise not_found("Idea")
    return r


@router.delete("/ideas/{idea_id}", status_code=204)
def delete_idea(idea_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    if not svc.delete_idea(db, user.id, parse_uuid(idea_id, "idea")):
        raise not_found("Idea")
    return Response(status_code=204)
