from __future__ import annotations

import json

from ..core.errors import bad_request, not_found
from ..db.session import Db
from ..engines.team_builder import Member, build_team, team_metrics
from ..engines.roles import role_for_skills
from . import catalog
from .common import skill_ids
from .notifications import notify
from .profiles import student_signals


def candidate_pool(db: Db, limit: int = 500) -> list[Member]:
    """Consent-gated by the database function itself: only students who opted in (open_to_team) and finished onboarding."""
    rows = db.all("select id::text as id, full_name, experience_level::text as level, availability_hrs, skills, interests from private.team_candidates(:n)", n=limit)
    return [Member(id=r["id"], name=r["full_name"] or "Student", skills=frozenset(s.lower() for s in r["skills"]),
                   interests=frozenset(i.lower() for i in r["interests"]), level=r["level"], availability_hrs=r["availability_hrs"]) for r in rows]


def requirements(db: Db, opportunity_id: str | None, required: list[str], preferred: list[str]) -> dict:
    ctx = {"opportunity": None, "required": [s.lower() for s in required], "preferred": [s.lower() for s in preferred], "max_team": None, "min_team": None}
    if opportunity_id:
        o = catalog.get_one(db, opportunity_id)
        if not o:
            raise not_found("Opportunity")
        ctx.update(opportunity={"id": o["id"], "title": o["title"], "organization": o["organization"], "isDemo": o["source_type"] == "dev_seed"},
                   required=sorted(set(ctx["required"]) | {s.lower() for s in o["required_skills"]}),
                   preferred=sorted(set(ctx["preferred"]) | {s.lower() for s in o["preferred_skills"]}), max_team=o["max_team_size"], min_team=o["min_team_size"])
    if not ctx["required"]:
        raise bad_request("Pick an opportunity with listed skills, or choose the skills your team needs")
    return ctx


def suggest(db: Db, user_id: str, opportunity_id: str | None, required: list[str], preferred: list[str], size: int) -> dict:
    ctx = requirements(db, opportunity_id, required, preferred)
    me = student_signals(db, user_id)
    profile = db.one("select full_name, availability_hrs, experience_level::text as level from public.profiles where id = cast(:u as uuid)", u=user_id)
    owner = Member(id=user_id, name=profile["full_name"] or "You", skills=me.skills, interests=me.interests, level=profile["level"], availability_hrs=profile["availability_hrs"])
    pool = candidate_pool(db)
    result = build_team(ctx["required"], ctx["preferred"], owner, pool, size, ctx["max_team"])
    return {"context": {"opportunity": ctx["opportunity"], "required": ctx["required"], "preferred": ctx["preferred"], "minTeam": ctx["min_team"], "maxTeam": ctx["max_team"]}, **result}


def save_team(db: Db, user_id: str, opportunity_id: str | None, required: list[str], preferred: list[str], member_ids: list[str], name: str | None, note: str | None, size: int) -> str:
    ctx = requirements(db, opportunity_id, required, preferred)
    pool = {m.id: m for m in candidate_pool(db)}
    unknown = [m for m in member_ids if m not in pool]
    if unknown:
        raise bad_request("Some people can't be invited: they aren't open to team invitations (or don't exist).", {"invalid": unknown})
    me = student_signals(db, user_id)
    profile = db.one("select full_name, availability_hrs, experience_level::text as level from public.profiles where id = cast(:u as uuid)", u=user_id)
    owner = Member(id=user_id, name=profile["full_name"] or "You", skills=me.skills, interests=me.interests, level=profile["level"], availability_hrs=profile["availability_hrs"])
    members = [owner] + [pool[m] for m in dict.fromkeys(member_ids)]
    R = frozenset(ctx["required"])
    metrics = team_metrics(members, R)                    # recomputed server-side: never trust client-supplied scores
    coverage = metrics["skillCoverage"]
    explanation = {"metrics": metrics, "required": ctx["required"], "preferred": ctx["preferred"]}
    with db.service():
        tid = db.val("""insert into public.teams (owner_id, coverage_score, diversity_score, requested_size, opportunity_id, name, note, status, explanation)
                        values (cast(:o as uuid), :c, :d, :s, cast(:opp as uuid), :n, :note, :st, cast(:e as jsonb)) returning id::text""",
                     o=user_id, c=coverage, d=metrics["score"], s=max(2, min(10, max(size, len(members)))), opp=opportunity_id, n=name, note=note,
                     st="forming" if len(members) > 1 else "draft", e=json.dumps(explanation))
        for sid in skill_ids(db, ctx["required"] + ctx["preferred"], create_missing=False).values():
            db.run("insert into public.team_target_skills (team_id, skill_id) values (cast(:t as uuid), cast(:s as uuid)) on conflict do nothing", t=tid, s=sid)
        for i, m in enumerate(members):
            contributed = sorted(m.skills & R)
            db.run("""insert into public.team_memberships (team_id, profile_id, role, status, contributed_skills, invited_at, responded_at)
                      values (cast(:t as uuid), cast(:p as uuid), :r, :st, :cs, :ia, :ra)""",
                   t=tid, p=m.id, r=("Team lead · " if i == 0 else "") + role_for_skills(m.skills & R or m.skills, prefer=set(R)), st="accepted" if i == 0 else "invited",
                   cs=contributed, ia=None if i == 0 else __import__("datetime").datetime.now(__import__("datetime").timezone.utc), ra=None)
        title = ctx["opportunity"]["title"] if ctx["opportunity"] else "a project"
        for m in members[1:]:
            notify(db, m.id, "team_event", f"{profile['full_name'] or 'A student'} invited you to a team", f"Team for {title}. Review the invitation and respond.", "/team-builder", f"team-invite:{tid}:{m.id}")
    return tid


def shape_team(db: Db, tid: str, viewer_id: str) -> dict | None:
    t = db.one("""select t.id::text as id, t.owner_id::text as owner_id, t.name, t.note, t.status, t.coverage_score::float as coverage, t.diversity_score::float as diversity, t.requested_size,
                         t.created_at, t.explanation, o.id::text as opp_id, o.title as opp_title from public.teams t left join public.opportunities o on o.id = t.opportunity_id
                   where t.id = cast(:i as uuid)""", i=tid)
    if not t:
        return None
    with db.service():   # membership rows of a team the viewer may see (RLS on teams already gated access above)
        members = db.all("""select m.profile_id::text as id, p.full_name as name, m.role, m.status, m.contributed_skills as skills, m.invited_at, m.responded_at
                              from public.team_memberships m join public.profiles p on p.id = m.profile_id where m.team_id = cast(:t as uuid)
                             order by (m.profile_id = cast(:o as uuid)) desc, p.full_name""", t=tid, o=t["owner_id"])
        skills = [r["name"] for r in db.all("select s.name from public.team_target_skills ts join public.skills s on s.id = ts.skill_id where ts.team_id = cast(:t as uuid) order by s.name", t=tid)]
    mine = next((m for m in members if m["id"] == viewer_id), None)
    return {"id": t["id"], "name": t["name"], "note": t["note"], "status": t["status"], "isOwner": t["owner_id"] == viewer_id, "myStatus": mine["status"] if mine else None,
            "coverage": t["coverage"], "diversity": t["diversity"], "requestedSize": t["requested_size"], "createdAt": t["created_at"],
            "opportunity": {"id": t["opp_id"], "title": t["opp_title"]} if t["opp_id"] else None, "requiredSkills": skills,
            "metrics": (t["explanation"] or {}).get("metrics"), "members": [{**m, "isYou": m["id"] == viewer_id} for m in members]}
