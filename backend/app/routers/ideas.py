from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response

from ..core.config import get_settings
from ..core.errors import AppError, not_found
from ..core.logging import get_logger
from ..core.middleware import limiter, rate_limit
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.originality import OriginalityCheckIn
from ..services import ideas as svc, originality_ai
from ..services.common import parse_uuid

router = APIRouter(prefix="/api", tags=["originality"])
log = get_logger("originality")

CheckIn = OriginalityCheckIn      # the request model lives in schemas/originality.py; this name is kept for existing imports


@router.get("/originality/status", summary="Which stages of the originality pipeline are available on this server")
def status(user: CurrentUser = Depends(require_student)):
    s = get_settings()
    # Model names are configuration, not secrets; the key never leaves the server. `provider` is the UI's data-use disclosure (who receives the text).
    return {"semantic": {"enabled": True, "model": svc.eng.MODEL_TAG, "search": "pgvector-hnsw-cosine", "thresholds": {"review": s.similarity_review_threshold, "related": s.similarity_related_threshold}},
            "ai": {"enabled": s.originality_ai_available, "provider": originality_ai.PROVIDER, "model": s.originality_ai_model if s.originality_ai_available else None,
                   "disclaimer": originality_ai.AI_DISCLAIMER}}


@router.post("/originality/check", status_code=201, summary="Analyse an idea against the comparison corpus (pgvector)",
             dependencies=[Depends(rate_limit("originality", 12))])
def check(body: CheckIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    opp = parse_uuid(body.opportunity_id, "opportunity") if body.opportunity_id else None
    if opp and not db.val("select 1 from public.opportunities where id = cast(:o as uuid)", o=opp):
        raise not_found("Opportunity")
    return svc.check(db, user.id, body.title, body.description, body.domain, opp, body.sections())


def ai_gate(request: Request, user: CurrentUser = Depends(require_student)) -> CurrentUser:
    """Per-user minute and day limits for the Gemini stage — counted only when the stage is actually on, so a disabled server never 429s."""
    s = get_settings()
    if not s.originality_ai_available:
        return user
    for key, limit, window in ((f"originality-ai:{user.id}", s.originality_ai_rate_limit_per_minute, 60), (f"originality-ai-day:{user.id}", s.originality_ai_daily_limit, 86400)):
        ok, retry = limiter.hit(key, limit, window)
        if not ok:
            log.warning("rate limited", extra={"event": "rate_limited", "path": request.url.path})
            raise AppError(429, "rate_limited", "You have run a lot of AI analyses. Please wait a bit and try again.", {"retryAfterSeconds": retry}, headers={"Retry-After": str(retry)})
    return user


@router.post("/ideas/{idea_id}/ai-analysis", summary="Stage 3: Gemini deep analysis of a checked idea (runs once; returns the stored report afterwards)")
def ai_analysis(idea_id: str, force: bool = Query(False, description="Re-run even if a completed report exists"), user: CurrentUser = Depends(ai_gate)):
    # No request-scoped DB dependency on purpose: the service opens two short transactions and holds no connection while the model runs.
    return originality_ai.run(user.id, user.email, parse_uuid(idea_id, "idea"), force=force)


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
