from __future__ import annotations

from ..db.session import Db


def log_activity(db: Db, user_id: str, kind: str, title: str, link: str | None = None) -> None:
    """Call only where the described thing actually happened."""
    db.run("insert into public.activities (student_id, kind, title, link) values (cast(:u as uuid), :k, :t, :l)", u=user_id, k=kind, t=title[:300], l=link)
