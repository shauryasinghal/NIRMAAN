from __future__ import annotations

import datetime as dt
import re
from uuid import UUID

from ..core.errors import bad_request, not_found
from ..db.session import Db


def parse_uuid(value: str, what: str = "id") -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError):
        raise not_found(what.capitalize())      # a malformed id can never match a row → 404, not 500


def like_escape(s: str) -> str:
    return re.sub(r"([\\%_])", r"\\\1", s)


def today() -> dt.date:
    return dt.date.today()


def skill_ids(db: Db, names: list[str], *, create_missing: bool = False) -> dict[str, str]:
    """name (lowercase) → uuid. Unknown skills are rejected: skills are a controlled vocabulary."""
    wanted = sorted({n.strip().lower() for n in names if n and n.strip()})
    if not wanted:
        return {}
    rows = db.all("select id::text, name from public.skills where name = any(:n)", n=wanted)
    found = {r["name"]: r["id"] for r in rows}
    unknown = [n for n in wanted if n not in found]
    if unknown:
        raise bad_request("Unknown skill(s): " + ", ".join(unknown), {"unknownSkills": unknown})
    return found


def interest_ids(db: Db, names: list[str]) -> dict[str, str]:
    wanted = sorted({n.strip().lower() for n in names if n and n.strip()})
    if not wanted:
        return {}
    rows = db.all("select id::text, lower(name) as name from public.interests where lower(name) = any(:n)", n=wanted)
    found = {r["name"]: r["id"] for r in rows}
    unknown = [n for n in wanted if n not in found]
    if unknown:
        raise bad_request("Unknown interest(s): " + ", ".join(unknown), {"unknownInterests": unknown})
    return found
