"""E2E seed: rebuild nirmaan_e2e from zero, load demo data through the real pipelines, create the test accounts.
TEST/DEV ONLY (refuses non-local databases). Accounts share one throwaway password."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql:///nirmaan_e2e")
ROOT = Path(__file__).resolve().parents[2]
PASSWORD = "E2e-pass-123"
USERS = {
    "student": ("e2e-student@nirmaan.test", "Fresh Student", "student", False),        # not onboarded → exercises onboarding
    "onboarded": ("e2e-onboarded@nirmaan.test", "Priya Nair", "student", True),
    "other": ("e2e-other@nirmaan.test", "Other Student", "student", True),
    "reviewer": ("e2e-reviewer@nirmaan.test", "Rita Reviewer", "reviewer", True),
    "admin": ("e2e-admin@nirmaan.test", "Adam Admin", "admin", True),
}


def main() -> None:
    if "localhost" not in os.environ["DATABASE_URL"] and "///" not in os.environ["DATABASE_URL"]:
        raise SystemExit("refusing: E2E seed only runs against a local database")
    subprocess.run([str(ROOT / "supabase/local/reset.sh"), "nirmaan_e2e"], check=True, capture_output=True)
    from sqlalchemy import text
    from app.db.session import get_engine, open_db
    from app.devseed import seed_catalog, seed_reference_ideas, seed_students
    from app.services import ideas as ideas_svc
    seed_students()
    with get_engine().begin() as c:
        for key, (email, name, role, done) in USERS.items():
            c.execute(text("insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values (:e, cast(:m as jsonb), cast(:a as jsonb), now())"),
                      {"e": email, "m": json.dumps({"full_name": name}), "a": json.dumps({"e2e_password": PASSWORD, "provider": "email"})})
    with open_db("service_role") as db:
        seed_catalog(db)
        print("reference ideas:", seed_reference_ideas(db), flush=True)
        for key, (email, name, role, done) in USERS.items():
            uid = db.val("select id::text from public.profiles where email = :e", e=email)
            if role != "student":
                db.run("update public.profiles set role = cast(:r as public.app_role) where id = cast(:i as uuid)", r=role, i=uid)
            if key == "other":   # a real, opted-in teammate the invitation flow can be exercised with
                db.run("update public.profiles set open_to_team = true where id = cast(:i as uuid)", i=uid)
            if done:
                db.run("update public.profiles set branch = 'CSE (AI/ML)', experience_level = 'intermediate', availability_hrs = 10, onboarding_completed = true, onboarding_completed_at = now(), location = 'Mathura' where id = cast(:i as uuid)", i=uid)
                for s in (("react", "javascript", "css", "sql", "api design", "java") if key == "other" else ("python", "machine learning", "nlp")):
                    db.run("insert into public.profile_skills (profile_id, skill_id) select cast(:i as uuid), id from public.skills where name = :n on conflict do nothing", i=uid, n=s)
                db.run("insert into public.profile_interests (profile_id, interest_id) select cast(:i as uuid), id from public.interests where name = 'AI/ML' on conflict do nothing", i=uid)
    # An idea that lands in the review queue (near-duplicate of a reference idea) so the reviewer flow has real work.
    with get_engine().begin() as c:
        uid = c.execute(text("select id::text from public.profiles where email = :e"), {"e": USERS["other"][0]}).scalar()
    with open_db("authenticated", uid) as db:
        r = ideas_svc.check(db, uid, "Teammate matcher for hackathons", "A platform to find teammates for hackathons whose technical skills match or complement yours, so teams have the right mix of abilities.", None, None)
        print("seeded idea:", r["verdict"]["level"], flush=True)
    print("e2e seed done", flush=True)




def write_resume_fixture() -> None:
    """A real PDF for the resume-upload E2E (generated, not committed)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    out = ROOT / "frontend/e2e/.tmp"
    out.mkdir(parents=True, exist_ok=True)
    lines = ["Priya Nair", "priya.nair@example.com | github.com/priyanair", "", "Education", "B.Tech CSE (AI/ML), GLA University, 2023-2027", "", "Skills", "Python, React, SQL, Docker, TensorFlow, Figma",
             "", "Projects", "Smart Attendance System - face recognition with Python", "Campus Marketplace - React frontend with a FastAPI backend", "", "Certifications", "Google Cloud Digital Leader"]
    c = canvas.Canvas(str(out / "resume.pdf"), pagesize=A4); y = 800
    for l in lines:
        c.drawString(50, y, l); y -= 16
    c.save()
    (out / "not-a-resume.pdf").write_bytes(b"MZ\x90\x00 this is an executable pretending to be a pdf")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT / "backend"))
    write_resume_fixture()
    main()
