"""Database access.

Every request-scoped connection runs as the Postgres role `authenticated` with the caller's verified
JWT claims set, so Row Level Security applies to the API exactly as it does to a direct PostgREST
client. Anything that legitimately needs elevated rights (writing notifications, embeddings,
audit rows …) must say so explicitly with `with db.service(): ...`.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from ..core.config import get_settings
from ..core.errors import unavailable
from ..core.logging import get_logger

log = get_logger("db")
_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        s = get_settings()
        if not s.database_url:
            raise unavailable("The database is not configured")
        _engine = create_engine(
            s.sqlalchemy_url, pool_size=s.db_pool_size, max_overflow=s.db_pool_size, pool_pre_ping=True,
            pool_recycle=1800, use_native_uuid=False, future=True,
        )
    return _engine


def dispose_engine() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None


class Db:
    """A thin, explicit-SQL wrapper around one transactional connection."""

    def __init__(self, conn: Connection, role: str, user_id: str | None):
        self.conn, self.role, self.user_id = conn, role, user_id

    # -- queries -------------------------------------------------------------------------------
    def all(self, sql: str, **params: Any) -> list[dict]:
        return [dict(r._mapping) for r in self.conn.execute(text(sql), params)]

    def one(self, sql: str, **params: Any) -> dict | None:
        row = self.conn.execute(text(sql), params).first()
        return dict(row._mapping) if row else None

    def val(self, sql: str, **params: Any) -> Any:
        return self.conn.execute(text(sql), params).scalar()

    def run(self, sql: str, **params: Any) -> int:
        return self.conn.execute(text(sql), params).rowcount

    # -- privilege ------------------------------------------------------------------------------
    def _set_role(self, role: str) -> None:
        self.conn.execute(text("select set_config('role', :r, true)"), {"r": role})
        self.role = role

    @contextmanager
    def service(self) -> Iterator["Db"]:
        """Temporarily run as service_role (bypasses RLS). Keep the block small and explicit."""
        previous = self.role
        self._set_role("service_role")
        try:
            yield self
        finally:
            self._set_role(previous)


@contextmanager
def open_db(role: str = "authenticated", user_id: str | None = None, extra_claims: dict | None = None) -> Iterator[Db]:
    """One transaction: commits on success, rolls back on any exception."""
    s = get_settings()
    with get_engine().connect() as conn:
        with conn.begin():
            claims: dict[str, Any] = {"role": role}
            if user_id:
                claims["sub"] = user_id
            if extra_claims:
                claims.update(extra_claims)
            conn.execute(
                text("select set_config('request.jwt.claims', :c, true), set_config('role', :r, true), "
                     "set_config('statement_timeout', :t, true)"),
                {"c": json.dumps(claims), "r": role, "t": str(s.db_statement_timeout_ms)},
            )
            yield Db(conn, role, user_id)


def vector_literal(vec) -> str:
    """pgvector text form; cast with ::extensions.vector in SQL."""
    return "[" + ",".join(f"{float(x):.7f}" for x in vec) + "]"
