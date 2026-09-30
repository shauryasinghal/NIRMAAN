from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import ConfigDict
from sqlalchemy.exc import DBAPIError

from ..core.errors import AppError, conflict, forbidden, not_found
from ..core.security import CurrentUser, get_db_admin, require_admin
from ..db.session import Db
from ..jobs.runner import run_job
from ..schemas.common import ApiModel
from ..services.common import like_escape, parse_uuid

router = APIRouter(prefix="/api/admin", tags=["admin"])


class RoleIn(ApiModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["student", "reviewer", "admin"]


@router.get("/users")
def users(q: Optional[str] = Query(None, max_length=100), role: Optional[Literal["student", "reviewer", "admin"]] = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
          admin: CurrentUser = Depends(require_admin), db: Db = Depends(get_db_admin)):
    where, p = ["true"], {}
    if q:
        where.append("(p.email ilike '%' || :q || '%' or p.full_name ilike '%' || :q || '%')"); p["q"] = like_escape(q)
    if role:
        where.append("p.role = cast(:r as public.app_role)"); p["r"] = role
    w = " and ".join(where)
    rows = db.all(f"select p.id::text as id, p.email, p.full_name, p.role::text as role, p.onboarding_completed, p.created_at from public.profiles p where {w} order by p.created_at desc limit :l offset :o", l=page_size, o=(page - 1) * page_size, **p)
    return {"items": [{"id": r["id"], "email": r["email"], "fullName": r["full_name"], "role": r["role"], "onboardingCompleted": r["onboarding_completed"], "createdAt": r["created_at"]} for r in rows],
            "total": db.val(f"select count(*) from public.profiles p where {w}", **p), "page": page, "pageSize": page_size}


@router.put("/users/{user_id}/role", summary="Change a role (server-side only, audited, never removes the last admin)")
def set_role(user_id: str, body: RoleIn, admin: CurrentUser = Depends(require_admin), db: Db = Depends(get_db_admin)):
    uid = parse_uuid(user_id, "user")
    try:
        db.run("select private.admin_set_role(cast(:t as uuid), cast(:r as public.app_role))", t=uid, r=body.role)
    except DBAPIError as exc:
        code = getattr(exc.orig, "pgcode", None)
        msg = (str(exc.orig).splitlines() or [""])[0].replace("ERROR:", "").strip().capitalize()
        raise {"42501": forbidden, "P0002": lambda m: not_found("User"), "P0001": conflict}.get(code, lambda m: AppError(500, "server_error", "Could not change role"))(msg)
    return {"id": uid, "role": body.role}


@router.get("/audit")
def audit(action: Optional[str] = Query(None, max_length=60), page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
          admin: CurrentUser = Depends(require_admin), db: Db = Depends(get_db_admin)):
    w, p = ("a.action = :a", {"a": action}) if action else ("true", {})
    rows = db.all(f"select a.id::text as id, a.action, a.entity, a.entity_id, a.detail, a.created_at, a.actor_id::text as actor_id from public.audit_log a where {w} order by a.created_at desc limit :l offset :o", l=page_size, o=(page - 1) * page_size, **p)
    actors = {r["id"]: r["email"] for r in db.all("select id::text as id, email from public.profiles where id = any(cast(:i as uuid[]))", i=[r["actor_id"] for r in rows if r["actor_id"]] or [])}
    return {"items": [{"id": r["id"], "action": r["action"], "entity": r["entity"], "entityId": r["entity_id"], "detail": r["detail"], "at": r["created_at"], "actor": actors.get(r["actor_id"])} for r in rows],
            "total": db.val(f"select count(*) from public.audit_log a where {w}", **p), "page": page, "pageSize": page_size}


@router.get("/ingestion")
def ingestion(admin: CurrentUser = Depends(require_admin), db: Db = Depends(get_db_admin)):
    sources = db.all("select key, name, kind, enabled, robots_reviewed_at, last_run_at from public.opportunity_sources order by key")
    runs = db.all("""select r.id::text as id, s.key as source, r.status, r.started_at, r.finished_at, r.fetched, r.inserted, r.updated, r.duplicates, r.rejected, r.error
                       from public.ingestion_runs r join public.opportunity_sources s on s.id = r.source_id order by r.started_at desc limit 20""")
    return {"sources": [{"key": s["key"], "name": s["name"], "kind": s["kind"], "enabled": s["enabled"], "robotsReviewedAt": s["robots_reviewed_at"], "lastRunAt": s["last_run_at"]} for s in sources],
            "runs": [{"id": r["id"], "source": r["source"], "status": r["status"], "startedAt": r["started_at"], "finishedAt": r["finished_at"], "fetched": r["fetched"], "inserted": r["inserted"],
                      "updated": r["updated"], "duplicates": r["duplicates"], "rejected": r["rejected"], "error": r["error"]} for r in runs]}


@router.post("/ingestion/{source}/run")
def run_ingestion(source: str, admin: CurrentUser = Depends(require_admin)):
    try:
        return run_job("ingest", source=source)
    except ValueError as exc:
        raise AppError(400, "bad_request", str(exc))
