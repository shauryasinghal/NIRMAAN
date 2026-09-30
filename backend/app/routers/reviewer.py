from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import ConfigDict, Field
from sqlalchemy.exc import DBAPIError

from ..core.errors import AppError, conflict, forbidden, not_found
from ..core.logging import get_logger
from ..core.security import CurrentUser, get_db_reviewer, require_reviewer
from ..db.session import Db
from ..schemas.common import ApiModel
from ..services.common import parse_uuid

router = APIRouter(prefix="/api/reviewer", tags=["reviewer"])
log = get_logger("reviewer")
Decision = Literal["approve", "request_changes", "escalate", "reject", "confirm_overlap", "dismiss"]


class DecisionIn(ApiModel):
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    decision: Decision
    note: Optional[str] = Field(None, max_length=2000)


@router.get("/queue", summary="Reviews awaiting a decision")
def queue(state: Literal["pending", "escalated", "all"] = "pending", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
          user: CurrentUser = Depends(require_reviewer), db: Db = Depends(get_db_reviewer)):
    where = {"pending": "r.state = 'pending'", "escalated": "r.state = 'escalated'", "all": "r.state in ('pending','escalated')"}[state]
    rows = db.all(f"""select r.id::text as review_id, r.state::text as state, r.created_at as queued_at, i.id::text as idea_id, i.title, left(i.description, 300) as description,
                             i.top_similarity::float as top, i.analysis ->> 'level' as level, i.confidence, (i.owner_id = cast(:u as uuid)) as is_mine,
                             (select count(*) from public.review_decisions d where d.review_id = r.id)::int as decisions
                        from public.reviews r join public.ideas i on i.id = r.idea_id where {where} order by r.created_at limit :l offset :o""", u=user.id, l=page_size, o=(page - 1) * page_size)
    total = db.val(f"select count(*) from public.reviews r where {where}")
    counts = {r["state"]: r["n"] for r in db.all("select state::text as state, count(*)::int as n from public.reviews group by 1")}
    return {"items": [{"reviewId": r["review_id"], "state": r["state"], "queuedAt": r["queued_at"], "ideaId": r["idea_id"], "title": r["title"], "description": r["description"],
                       "topSimilarity": r["top"], "level": r["level"], "confidence": r["confidence"], "isMine": r["is_mine"], "decisions": r["decisions"]} for r in rows],
            "total": total, "counts": counts, "page": page, "pageSize": page_size}


@router.get("/reviews/{review_id}", summary="Everything a reviewer needs to decide")
def detail(review_id: str, user: CurrentUser = Depends(require_reviewer), db: Db = Depends(get_db_reviewer)):
    rid = parse_uuid(review_id, "review")
    r = db.one("""select r.id::text as id, r.state::text as state, r.created_at, i.id::text as idea_id, i.title, i.description, i.status::text as status, i.top_similarity::float as top,
                         i.confidence, i.analysis, i.created_at as submitted_at, i.owner_id::text as owner_id, d.name as domain, o.title as opp_title
                    from public.reviews r join public.ideas i on i.id = r.idea_id left join public.interests d on d.id = i.domain_id left join public.opportunities o on o.id = i.opportunity_id
                   where r.id = cast(:r as uuid)""", r=rid)
    if not r:
        raise not_found("Review")
    matches = db.all("""select m.similarity::float as similarity, m.rank, m.overlap, m.visible_to_owner, x.id::text as id, x.kind::text as kind, x.title, x.description, x.source, x.created_at
                          from public.idea_matches m join public.ideas x on x.id = m.matched_idea_id where m.idea_id = cast(:i as uuid) order by m.rank""", i=r["idea_id"])
    with db.service():     # reviewer names and the submitter's history are not reachable through RLS by design
        decisions = db.all("""select d.decision::text as decision, d.note, d.created_at, split_part(coalesce(p.full_name, 'Reviewer'), ' ', 1) as reviewer
                                from public.review_decisions d join public.profiles p on p.id = d.reviewer_id where d.review_id = cast(:r as uuid) order by d.created_at""", r=rid)
        history = db.all("select status::text as status, count(*)::int as n from public.ideas where owner_id = cast(:o as uuid) and kind = 'submission' group by 1", o=r["owner_id"])
    a = r["analysis"] or {}
    return {"id": r["id"], "state": r["state"], "queuedAt": r["created_at"], "isMine": r["owner_id"] == user.id,
            "idea": {"id": r["idea_id"], "title": r["title"], "description": r["description"], "domain": r["domain"], "status": r["status"], "submittedAt": r["submitted_at"],
                     "opportunity": r["opp_title"]},
            "similarity": {"top": r["top"], "confidence": r["confidence"], "level": a.get("level"), "message": a.get("message"), "method": a.get("method"),
                           "corpusSize": a.get("corpusSize"), "thresholds": a.get("thresholds"), "disclaimer": a.get("disclaimer")},
            "matches": [{"id": m["id"], "kind": "reference" if m["kind"] == "reference" else "peer submission", "title": m["title"], "description": m["description"], "source": m["source"],
                         "similarity": m["similarity"], "overlap": m["overlap"], "shownToSubmitter": m["visible_to_owner"]} for m in matches],
            "submitterHistory": {row["status"]: row["n"] for row in history},
            "decisions": [{"decision": d["decision"], "note": d["note"], "at": d["created_at"], "reviewer": d["reviewer"]} for d in decisions],
            "canDecide": not (r["owner_id"] == user.id) and r["state"] != "decided" and (r["state"] != "escalated" or user.is_admin)}


_PG = {"42501": lambda m: forbidden(m), "P0002": lambda m: not_found("Review"), "P0001": lambda m: conflict(m), "22023": lambda m: AppError(422, "validation_error", m)}


@router.post("/reviews/{review_id}/decision", summary="Decide a review (creates an immutable decision + audit record)")
def decide(review_id: str, body: DecisionIn, user: CurrentUser = Depends(require_reviewer), db: Db = Depends(get_db_reviewer)):
    rid = parse_uuid(review_id, "review")
    try:
        did = db.val("select private.decide_review(cast(:r as uuid), cast(:d as public.review_decision_kind), :n)::text", r=rid, d=body.decision, n=body.note)
    except DBAPIError as exc:
        code = getattr(exc.orig, "pgcode", None)
        msg = (str(exc.orig).splitlines() or [""])[0].replace("ERROR:", "").strip()
        log.warning("review decision refused", extra={"event": "review_refused", "code": code})
        if code in _PG:
            raise _PG[code](msg[:200].capitalize())
        raise
    log.info("review decided", extra={"event": "review_decided", "code": body.decision})
    return {"decisionId": did, "reviewId": rid, "decision": body.decision}
