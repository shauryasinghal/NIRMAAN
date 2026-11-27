"""Development / demo seed. NEVER runs in production, and everything it writes is labelled demo data.

    python -m app.devseed corpus            # 50 reference ideas + real MiniLM embeddings (needs the model)
    python -m app.devseed catalog           # demo opportunities via the real ingestion pipeline
    python -m app.devseed students          # demo students (LOCAL stub auth only — refuses to touch a real Supabase project)
    python -m app.devseed all

SAFETY: demo data may only be written to a LOCAL database. If DATABASE_URL or SUPABASE_URL points anywhere else (e.g. the hosted
Supabase project in backend/.env) every command refuses unless you explicitly opt in on the command line:

    SEED_DEMO_DATA=true python -m app.devseed catalog

The opt-in is read from the process environment only — it is deliberately not a setting, so it can never be persisted in .env.
Seeding is idempotent (same source + external id => update in place), and everything written is labelled demo data.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

from .core.config import get_settings
from .db.session import Db, get_engine, open_db, vector_literal
from .engines import originality as eng

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
CORPUS_SOURCE = "Demo data (reference corpus)"


LOCAL_HOSTS = {"", "localhost", "127.0.0.1", "::1"}


def _is_local(host: str | None) -> bool:
    return (host or "") in LOCAL_HOSTS or (host or "").startswith("/")      # unix-socket paths are local too


def assert_demo_seed_allowed() -> str:
    """Refuse to write demo data to anything that is not clearly local unless SEED_DEMO_DATA=true was passed explicitly.
    Returns a short, secret-free description of the target (host only — never credentials)."""
    s = get_settings()
    if s.is_production:
        raise SystemExit("devseed never runs in production")
    db_host = urlsplit(s.sqlalchemy_url).hostname
    auth_host = urlsplit(s.supabase_url).hostname if s.supabase_url else None
    remote = [h for h in (db_host, auth_host) if h and not _is_local(h)]
    target = f"database host '{db_host or 'local socket'}'" + (f", auth host '{auth_host}'" if auth_host else "")
    if remote and os.environ.get("SEED_DEMO_DATA", "").lower() != "true":
        raise SystemExit(f"Refusing to seed demo data: {target} is not local (this looks like a real Supabase project). "
                         "If you really intend to add clearly-labelled DEMO rows there, re-run with SEED_DEMO_DATA=true on the command line.")
    return target


def seed_reference_ideas(db: Db, embedder=None) -> int:
    """Idempotent: skips titles already present."""
    assert_demo_seed_allowed()
    embedder = embedder or eng.get_embedder()
    items = json.loads((FIXTURES / "ideas.reference.dev.json").read_text())
    with db.service():
        have = {r["title"] for r in db.all("select title from public.ideas where kind = 'reference'")}
        todo = [i for i in items if i["title"] not in have]
        if not todo:
            return 0
        vecs = embedder.encode([eng.idea_text(i["title"], i["description"]) for i in todo])
        for it, v in zip(todo, vecs):
            iid = db.val("insert into public.ideas (kind, title, description, source) values ('reference', :t, :d, :s) returning id::text", t=it["title"], d=it["description"], s=CORPUS_SOURCE)
            db.run("insert into public.idea_embeddings (idea_id, model, embedding) values (cast(:i as uuid), :m, cast(:v as extensions.vector))", i=iid, m=embedder.name, v=vector_literal(v))
    return len(todo)


def seed_catalog(db: Db) -> dict:
    assert_demo_seed_allowed()
    from .ingestion.pipeline import run_source
    from .ingestion.sources.fixture import FixtureSource
    s = run_source(db, FixtureSource())
    return {"inserted": s.inserted, "updated": s.updated, "rejected": s.rejected}


ARCHETYPES = [("frontend", ["react", "javascript", "ui/ux", "css"], "Web Development"), ("backend", ["python", "sql", "api design", "cloud"], "Cloud"),
              ("ml", ["python", "machine learning", "deep learning", "nlp"], "AI/ML"), ("design", ["ui/ux", "figma", "css"], "EdTech"),
              ("data", ["data science", "python", "sql"], "Data Science"), ("devops", ["cloud", "docker", "devops"], "DevOps"),
              ("security", ["cybersecurity", "networking", "python"], "Cybersecurity"), ("iot", ["python", "iot", "data science"], "ClimateTech")]
FIRST = ["Ananya", "Rohit", "Priya", "Karan", "Sneha", "Aditya", "Ishita", "Vikram", "Meera", "Arjun", "Divya", "Rahul", "Neha", "Siddharth", "Pooja", "Amit"]
LAST = ["Sharma", "Verma", "Nair", "Mehta", "Iyer", "Rao", "Gupta", "Singh"]


def seed_students(n: int = 24) -> int:
    """Creates demo users in the LOCAL stub auth.users. On real Supabase, users must be created through Auth (signup/invite)."""
    s = get_settings()
    if s.is_production or s.supabase_url:
        raise SystemExit("Refusing to seed demo students: this environment points at a real Supabase project (create users through Supabase Auth instead).")
    from sqlalchemy import text
    made = 0
    with get_engine().begin() as conn:
        for i in range(n):
            name = f"{FIRST[i % len(FIRST)]} {LAST[(i * 3) % len(LAST)]}"
            email = f"demo.{name.lower().replace(' ', '.')}.{i}@demo.nirmaan.test"
            if conn.execute(text("select 1 from auth.users where email = :e"), {"e": email}).first():
                continue
            conn.execute(text("insert into auth.users (email, raw_user_meta_data) values (:e, cast(:m as jsonb))"), {"e": email, "m": json.dumps({"full_name": name})})
            made += 1
    with open_db("service_role") as db:
        for i, p in enumerate(db.all("select id::text as id from public.profiles where email like 'demo.%@demo.nirmaan.test' order by email")):
            _, skills, interest = ARCHETYPES[i % len(ARCHETYPES)]
            db.run("""update public.profiles set branch = 'CSE (AI/ML)', year = :y, experience_level = cast(:l as public.skill_level), availability_hrs = :h, open_to_team = true,
                         onboarding_completed = true, onboarding_completed_at = now(), location = 'Mathura' where id = cast(:i as uuid)""",
                   i=p["id"], y=str(i % 4 + 1), l=["beginner", "intermediate", "advanced"][i % 3], h=5 + (i % 6) * 3)
            db.run("delete from public.profile_skills where profile_id = cast(:i as uuid)", i=p["id"])
            for sk in skills:
                db.run("insert into public.profile_skills (profile_id, skill_id) select cast(:i as uuid), id from public.skills where name = :n on conflict do nothing", i=p["id"], n=sk)
            db.run("insert into public.profile_interests (profile_id, interest_id) select cast(:i as uuid), id from public.interests where name = :n on conflict do nothing", i=p["id"], n=interest)
    return made


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    print("devseed target:", assert_demo_seed_allowed())
    if what in ("catalog", "all"):
        with open_db("service_role") as db: print("catalog", seed_catalog(db))
    if what in ("corpus", "all"):
        with open_db("service_role") as db: print("reference ideas added:", seed_reference_ideas(db))
    if what in ("students", "all"):
        print("demo students created:", seed_students())
