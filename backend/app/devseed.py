"""Development / demo seed. NEVER runs in production, and everything it writes is labelled demo data.

    python -m app.devseed corpus            # 50 reference ideas + real MiniLM embeddings (needs the model)
    python -m app.devseed catalog           # demo opportunities via the real ingestion pipeline
    python -m app.devseed students          # demo students (LOCAL stub auth only — refuses to touch a real Supabase project)
    python -m app.devseed all
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .core.config import get_settings
from .db.session import Db, get_engine, open_db, vector_literal
from .engines import originality as eng

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
CORPUS_SOURCE = "Demo data (reference corpus)"


def seed_reference_ideas(db: Db, embedder=None) -> int:
    """Idempotent: skips titles already present."""
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
    if get_settings().is_production:
        raise SystemExit("devseed never runs in production")
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("catalog", "all"):
        with open_db("service_role") as db: print("catalog", seed_catalog(db))
    if what in ("corpus", "all"):
        with open_db("service_role") as db: print("reference ideas added:", seed_reference_ideas(db))
    if what in ("students", "all"):
        print("demo students created:", seed_students())
