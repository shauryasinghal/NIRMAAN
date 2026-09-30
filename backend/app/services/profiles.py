from __future__ import annotations

from ..db.session import Db
from ..engines.types import StudentSignals
from .common import interest_ids, skill_ids

PROFILE_COLS = """p.id::text as id, p.email, p.full_name, p.role::text as role, p.year, p.branch, p.experience_level::text as experience_level,
  p.availability_hrs, p.open_to_team, p.onboarding_completed, p.onboarding_completed_at, p.participation_pref::text as participation_pref,
  p.location, p.education_level, p.preferred_format::text as preferred_format, p.created_at"""


def get_profile(db: Db, user_id: str) -> dict:
    p = db.one(f"select {PROFILE_COLS} from public.profiles p where p.id = cast(:u as uuid)", u=user_id)
    skills = db.all("""select s.name, ps.status, ps.source, ps.confidence::float as confidence, ps.confirmed_at
                         from public.profile_skills ps join public.skills s on s.id = ps.skill_id
                        where ps.profile_id = cast(:u as uuid) order by s.name""", u=user_id)
    interests = db.all("""select i.name from public.profile_interests pi join public.interests i on i.id = pi.interest_id
                           where pi.profile_id = cast(:u as uuid) order by i.name""", u=user_id)
    evidence = db.all("""select s.name as skill, e.source, e.evidence, e.confidence::float as confidence, e.created_at
                           from public.skill_evidence e join public.skills s on s.id = e.skill_id
                          where e.profile_id = cast(:u as uuid) order by e.created_at desc limit 100""", u=user_id)
    p["skills"] = [s["name"] for s in skills if s["status"] == "confirmed"]
    p["inferred_skills"] = [{"name": s["name"], "source": s["source"], "confidence": s["confidence"]} for s in skills if s["status"] == "inferred"]
    p["skill_details"] = skills
    p["interests"] = [i["name"] for i in interests]
    p["skill_evidence"] = evidence
    p["completeness"] = completeness(p)
    return p


def completeness(p: dict) -> dict:
    checks = {"skills": bool(p["skills"]), "interests": bool(p["interests"]), "branch": bool(p["branch"]),
              "experienceLevel": True, "location": bool(p.get("location")), "preferredFormat": bool(p.get("preferred_format"))}
    core = ["skills", "interests", "branch"]
    return {"complete": all(checks[k] for k in core), "missing": [k for k in core if not checks[k]],
            "optionalMissing": [k for k in ("location", "preferredFormat") if not checks[k]],
            "percent": round(100 * sum(checks.values()) / len(checks))}


def update_profile(db: Db, user_id: str, data: dict) -> None:
    scalar = {k: v for k, v in data.items() if k in {"full_name", "year", "branch", "experience_level", "availability_hrs", "open_to_team",
                                                       "participation_pref", "location", "education_level", "preferred_format", "onboarding_completed"}}
    if scalar:
        sets = ", ".join(f"{k} = cast(:{k} as {t})" if (t := {"experience_level": "public.skill_level", "participation_pref": "public.participation_pref",
                                                             "preferred_format": "public.opportunity_format"}.get(k)) else f"{k} = :{k}" for k in scalar)
        db.run(f"update public.profiles set {sets} where id = cast(:u as uuid)", u=user_id, **scalar)
    if "skills" in data and data["skills"] is not None:
        set_confirmed_skills(db, user_id, data["skills"], source="user")
    if "interests" in data and data["interests"] is not None:
        ids = interest_ids(db, data["interests"])
        db.run("delete from public.profile_interests where profile_id = cast(:u as uuid)", u=user_id)
        for iid in ids.values():
            db.run("insert into public.profile_interests (profile_id, interest_id) values (cast(:u as uuid), cast(:i as uuid))", u=user_id, i=iid)
    if data.get("onboarding_completed"):
        db.run("update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = cast(:u as uuid)", u=user_id)


def set_confirmed_skills(db: Db, user_id: str, names: list[str], source: str = "user") -> None:
    """Replace the set of CONFIRMED skills. Inferred rows are left untouched (they need explicit confirmation)."""
    ids = skill_ids(db, names)
    db.run("delete from public.profile_skills where profile_id = cast(:u as uuid) and status = 'confirmed' and skill_id <> all(cast(:keep as uuid[]))",
           u=user_id, keep=list(ids.values()))
    for name, sid in ids.items():
        db.run("""insert into public.profile_skills (profile_id, skill_id, status, source, confidence, confirmed_at)
                  values (cast(:u as uuid), cast(:s as uuid), 'confirmed', :src, 1.0, now())
                  on conflict (profile_id, skill_id) do update
                     set status = 'confirmed', confirmed_at = coalesce(public.profile_skills.confirmed_at, now())""", u=user_id, s=sid, src=source)


def add_inferred_skills(db: Db, user_id: str, items: list[dict]) -> int:
    """items: {skill, source, evidence, confidence}. Never overwrites a confirmed skill; needs service role."""
    n = 0
    with db.service():
        for it in items:
            sid = db.val("select id::text from public.skills where name = :n", n=it["skill"])
            if not sid:
                continue
            exists = db.val("select status from public.profile_skills where profile_id = cast(:u as uuid) and skill_id = cast(:s as uuid)", u=user_id, s=sid)
            if exists is None:
                db.run("insert into public.profile_skills (profile_id, skill_id, status, source, confidence) values (cast(:u as uuid), cast(:s as uuid), 'inferred', :src, :c)",
                       u=user_id, s=sid, src=it["source"], c=it.get("confidence", 0.5))
                n += 1
            db.run("insert into public.skill_evidence (profile_id, skill_id, source, evidence, confidence) values (cast(:u as uuid), cast(:s as uuid), :src, :e, :c)",
                   u=user_id, s=sid, src=it["source"], e=it["evidence"][:500], c=it.get("confidence", 0.5))
    return n


def confirm_inferred_skill(db: Db, user_id: str, name: str) -> bool:
    return db.run("""update public.profile_skills ps set status = 'confirmed', confirmed_at = now(), source = 'user'
                       from public.skills s where s.id = ps.skill_id and s.name = :n and ps.profile_id = cast(:u as uuid) and ps.status = 'inferred'""",
                  n=name.lower(), u=user_id) > 0


def remove_skill(db: Db, user_id: str, name: str) -> bool:
    return db.run("""delete from public.profile_skills ps using public.skills s
                      where s.id = ps.skill_id and s.name = :n and ps.profile_id = cast(:u as uuid)""", n=name.lower(), u=user_id) > 0


def student_signals(db: Db, user_id: str) -> StudentSignals:
    p = db.one(f"select {PROFILE_COLS} from public.profiles p where p.id = cast(:u as uuid)", u=user_id)
    rows = db.all("""select s.name, ps.status from public.profile_skills ps join public.skills s on s.id = ps.skill_id
                      where ps.profile_id = cast(:u as uuid)""", u=user_id)
    interests = db.all("select lower(i.name) as name from public.profile_interests pi join public.interests i on i.id = pi.interest_id where pi.profile_id = cast(:u as uuid)", u=user_id)
    return StudentSignals(
        id=user_id, skills=frozenset(r["name"] for r in rows if r["status"] == "confirmed"),
        inferred_skills=frozenset(r["name"] for r in rows if r["status"] == "inferred"),
        interests=frozenset(i["name"] for i in interests), level=p["experience_level"], availability_hrs=p["availability_hrs"],
        participation_pref=p["participation_pref"], preferred_format=p["preferred_format"], location=p["location"],
        education_level=p["education_level"], open_to_team=p["open_to_team"])
