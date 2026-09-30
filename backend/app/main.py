from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import get_settings
from .core.errors import install_error_handlers
from .core.logging import configure_logging, get_logger
from .core.middleware import GlobalRateLimitMiddleware, RequestContextMiddleware
from .db.session import dispose_engine, open_db
from .routers import resume, admin, alerts, ideas, reviewer, teams, activity, applications, auth, notifications, opportunities, profile, saved

VERSION = "1.0.0"
log = get_logger("app")


def create_app() -> FastAPI:
    s = get_settings()
    configure_logging(s.log_level, s.log_json)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        log.info("starting", extra={"event": "startup", "source": s.env})
        if s.preload_embedding_model:
            from .engines.originality import embedding_available
            embedding_available()
        from .jobs.scheduler import make_scheduler
        scheduler = make_scheduler(s.scheduler_enabled)
        scheduler.start()
        yield
        scheduler.stop()
        dispose_engine()

    app = FastAPI(
        title="NIRMAAN API", version=VERSION, lifespan=lifespan,
        description="The AI Operating System for Student Innovation. Authentication is handled by Supabase Auth; "
                    "send the Supabase access token as `Authorization: Bearer <jwt>`.",
        docs_url=None if s.is_production else "/docs", redoc_url=None if s.is_production else "/redoc", openapi_url=None if s.is_production else "/openapi.json",
    )
    origins = s.cors_list or ([s.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"] if not s.is_production else [])
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                       allow_headers=["Authorization", "Content-Type", "X-Request-ID"], expose_headers=["X-Request-ID", "Retry-After"], max_age=600)
    app.add_middleware(GlobalRateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)
    install_error_handlers(app)

    for r in (auth.router, profile.router, opportunities.router, saved.router, applications.router, notifications.router, activity.router, alerts.router, alerts.internal, teams.router, ideas.router, reviewer.router, admin.router, resume.router):
        app.include_router(r)

    @app.get("/health", tags=["ops"], summary="Liveness — process is up (no dependencies)")
    def health():
        return {"status": "ok", "service": "nirmaan-api", "version": VERSION}

    @app.get("/ready", tags=["ops"], summary="Readiness — dependencies the API needs to serve traffic")
    def ready():
        checks: dict[str, dict] = {}
        ok = True
        try:
            with open_db("service_role") as db:
                db.val("select 1")
                checks["database"] = {"status": "ok"}
                has_vector = bool(db.val("select 1 from pg_extension where extname = 'vector'"))
                has_schema = bool(db.val("select to_regclass('public.profiles') is not null"))
                checks["pgvector"] = {"status": "ok" if has_vector else "missing"}
                checks["schema"] = {"status": "ok" if has_schema else "missing"}
                ok = has_vector and has_schema
        except Exception as exc:
            checks["database"] = {"status": "error", "error": type(exc).__name__}
            ok = False
        checks["auth"] = {"status": "ok" if (s.supabase_url or s.supabase_jwt_secret) else "unconfigured"}
        ok = ok and checks["auth"]["status"] == "ok"
        from .engines.originality import MiniLMEmbedder, get_embedder
        e = get_embedder()
        checks["embeddingModel"] = {"status": "loaded" if getattr(e, "_model", True) is not None else "lazy", "name": e.name, "dim": e.dim}
        checks["googleIntegrations"] = {"status": "enabled" if s.google_integrations_enabled else "disabled"}
        return JSONResponse({"status": "ready" if ok else "not_ready", "checks": checks}, status_code=200 if ok else 503)

    return app


app = create_app()
