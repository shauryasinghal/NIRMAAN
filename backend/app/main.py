import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models, seed_data
from .database import engine, SessionLocal
from .routers import (
    auth, profile, opportunities, team, idea, reviewer, saved, applications,
    notifications, saved_searches, activity, organizations, intelligence,
    google_auth, calendar, resume,
)
from .engines import originality

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("nirmaan")

models.Base.metadata.create_all(bind=engine)

with SessionLocal() as db:
    seed_data.run(db)

app = FastAPI(
    title="NIRMAAN API",
    description="The AI Operating System for Student Innovation — Opportunity Recommender, "
                 "AI Team Builder and Originality Checker behind one API.",
    version="0.2.0",
)

# CORS_ORIGINS is a comma-separated list, e.g. "https://nirmaan.app,https://staging.nirmaan.app".
# Defaults to "*" for local development only — set this explicitly in any deployed environment.
_cors_env = os.getenv("CORS_ORIGINS", "*")
if _cors_env.strip() == "*":
    logger.warning("CORS_ORIGINS not set — allowing all origins. Set CORS_ORIGINS in production.")
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(opportunities.router)
app.include_router(team.router)
app.include_router(idea.router)
app.include_router(reviewer.router)
app.include_router(saved.router)
app.include_router(applications.router)
app.include_router(notifications.router)
app.include_router(saved_searches.router)
app.include_router(activity.router)
app.include_router(organizations.router)
app.include_router(intelligence.router)
app.include_router(google_auth.router)
app.include_router(calendar.router)
app.include_router(resume.router)


@app.get("/health")
def health():
    from sqlalchemy import text
    db_status = "ok"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e}"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "service": "nirmaan-api",
        "database": db_status,
        "embeddingMode": originality.EMBEDDING_MODE,
    }
