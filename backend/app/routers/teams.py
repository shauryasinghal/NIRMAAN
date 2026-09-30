from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import ConfigDict, Field

from ..core.errors import bad_request, conflict, not_found
from ..core.middleware import rate_limit
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.common import ApiModel
from ..services import events, teams as svc
from ..services.activity import log_activity
from ..services.common import parse_uuid
from ..services.notifications import notify

router = APIRouter(prefix="/api/teams", tags=["teams"])


class SuggestIn(ApiModel):
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    opportunity_id: Optional[str] = None
    required_skills: list[str] = Field(default_factory=list, max_length=30)
    preferred_skills: list[str] = Field(default_factory=list, max_length=30)
    size: int = Field(4, ge=2, le=10)


class SaveIn(SuggestIn):
    member_ids: list[str] = Field(default_factory=list, max_length=9)
    name: Optional[str] = Field(None, max_length=120)
    note: Optional[str] = Field(None, max_length=1000)


class RespondIn(ApiModel):
    accept: bool


def _oid(v: str | None) -> str | None:
    return parse_uuid(v, "opportunity") if v else None


@router.post("/suggest", summary="Suggest a team from an opportunity's requirements", dependencies=[Depends(rate_limit("team-suggest", 30))])
def suggest(body: SuggestIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    return svc.suggest(db, user.id, _oid(body.opportunity_id), body.required_skills, body.preferred_skills, body.size)


@router.post("", status_code=201, summary="Save a team and invite the chosen members")
def save(body: SaveIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    tid = svc.save_team(db, user.id, _oid(body.opportunity_id), body.required_skills, body.preferred_skills, [parse_uuid(m, "member") for m in body.member_ids],
                        body.name, body.note, body.size)
    events.record(db, user.id, "team_create", _oid(body.opportunity_id), {"members": len(body.member_ids) + 1})
    log_activity(db, user.id, "team_created", f"Built a team of {len(body.member_ids) + 1}", "/team-builder")
    return svc.shape_team(db, tid, user.id)


@router.get("")
def list_teams(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    ids = [r["id"] for r in db.all("select id::text as id from public.teams order by created_at desc")]     # RLS: owner or invited/accepted member
    return {"items": [t for t in (svc.shape_team(db, i, user.id) for i in ids) if t]}


@router.get("/{team_id}")
def get_team(team_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    tid = parse_uuid(team_id, "team")
    if not db.val("select 1 from public.teams where id = cast(:i as uuid)", i=tid):      # RLS decides visibility
        raise not_found("Team")
    return svc.shape_team(db, tid, user.id)


@router.post("/{team_id}/respond", summary="Accept or decline an invitation")
def respond(team_id: str, body: RespondIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    tid = parse_uuid(team_id, "team")
    with db.service():
        m = db.one("select status from public.team_memberships where team_id = cast(:t as uuid) and profile_id = cast(:u as uuid)", t=tid, u=user.id)
        t = db.one("select owner_id::text as owner_id, name from public.teams where id = cast(:t as uuid)", t=tid)
        if not m or not t:
            raise not_found("Invitation")
        if m["status"] != "invited":
            raise conflict(f"This invitation was already {m['status']}")
        db.run("update public.team_memberships set status = :s, responded_at = now() where team_id = cast(:t as uuid) and profile_id = cast(:u as uuid)", s="accepted" if body.accept else "declined", t=tid, u=user.id)
        who = db.val("select full_name from public.profiles where id = cast(:u as uuid)", u=user.id) or "A student"
        notify(db, t["owner_id"], "team_event", f"{who} {'accepted' if body.accept else 'declined'} your team invitation", "", "/team-builder", f"team-response:{tid}:{user.id}")
    log_activity(db, user.id, "team_response", f"{'Accepted' if body.accept else 'Declined'} a team invitation", "/team-builder")
    status = "accepted" if body.accept else "declined"
    # a declined invitee correctly loses visibility of the team, so return the outcome rather than re-reading it
    return (svc.shape_team(db, tid, user.id) if body.accept else None) or {"id": tid, "myStatus": status}


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    tid = parse_uuid(team_id, "team")
    if not db.run("delete from public.teams where id = cast(:i as uuid) and owner_id = cast(:u as uuid)", i=tid, u=user.id):
        raise not_found("Team")       # not yours (or doesn't exist): RLS + explicit owner check
    return Response(status_code=204)
