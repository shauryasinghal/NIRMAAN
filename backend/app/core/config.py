"""Typed settings. Everything comes from the environment (or a local .env) — nothing secret is
hard-coded, and a production process refuses to start with an unsafe configuration."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False)

    env: Literal["development", "test", "production"] = Field("development", alias="NIRMAAN_ENV")

    # ── Database (Supabase Postgres) ────────────────────────────────────────
    database_url: str = ""
    db_pool_size: int = 5
    db_statement_timeout_ms: int = 15_000

    # ── Supabase Auth: the API only *verifies* tokens; it never issues them ──
    supabase_url: str = ""                 # https://<ref>.supabase.co  → JWKS + issuer + auth settings
    supabase_jwt_secret: str = ""          # legacy HS256 projects and the test-suite only
    supabase_jwt_audience: str = "authenticated"
    session_check: bool = True             # reject tokens whose auth.sessions row was revoked
    session_cache_seconds: int = 10        # how long a 'session is active' answer is cached (= worst-case delay before a sign-out takes effect)

    # ── HTTP surface ────────────────────────────────────────────────────────
    cors_origins: str = ""                 # comma separated; "*" is refused in production
    frontend_url: str = "http://localhost:5173"
    rate_limit_per_minute: int = 240
    max_request_bytes: int = 6 * 1024 * 1024

    # ── Background jobs (external cron calls POST /api/internal/jobs/*) ─────
    cron_secret: str = ""
    scheduler_enabled: bool = False        # in-process scheduler (single-instance deployments)

    # ── Optional Google integrations (Calendar / Gmail). Google *login* is Supabase's job. ──
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    token_encryption_key: str = ""         # Fernet key: encrypts stored OAuth tokens

    # ── ML ─────────────────────────────────────────────────────────────────
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dim: int = 384
    similarity_review_threshold: float = 0.75   # cosine ≥ this → queued for human review
    similarity_related_threshold: float = 0.55  # cosine ≥ this → "related work" flag
    preload_embedding_model: bool = False

    log_level: str = "INFO"
    log_json: bool = True

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def google_integrations_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.google_redirect_uri and self.token_encryption_key)

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        return url

    @model_validator(mode="after")
    def _production_guardrails(self) -> "Settings":
        if self.is_production:
            problems = []
            if not self.database_url:
                problems.append("DATABASE_URL is required")
            if not (self.supabase_url or self.supabase_jwt_secret):
                problems.append("SUPABASE_URL (or SUPABASE_JWT_SECRET) is required to verify tokens")
            if not self.cors_list or "*" in self.cors_list:
                problems.append("CORS_ORIGINS must list the real frontend origin(s); '*' is not allowed")
            if self.supabase_jwt_secret and len(self.supabase_jwt_secret) < 32:
                problems.append("SUPABASE_JWT_SECRET looks too short")
            if problems:
                raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:  # used by tests
    get_settings.cache_clear()
