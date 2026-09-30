from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import ConfigDict, Field

from ..core.errors import AppError, bad_request
from ..core.middleware import rate_limit
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..resume_parser import MAX_FILE_BYTES, ResumeError, extract_text, parse_resume, validate_upload
from ..schemas.common import ApiModel
from ..schemas.profile import ProfileOut
from ..services import profiles as profiles_svc
from ..services.activity import log_activity

router = APIRouter(prefix="/api/profile/resume", tags=["resume"])
KINDS = {"education": "education", "projects": "project", "certifications": "certification", "experience": "experience", "achievements": "achievement"}


@router.post("/extract", summary="Extract from a PDF/DOCX resume. Nothing is saved until you confirm.",
             dependencies=[Depends(rate_limit("resume", 10))])
async def extract(file: UploadFile = File(...), user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    data = await file.read(MAX_FILE_BYTES + 1)          # never buffer more than the cap + 1 byte
    try:
        kind = validate_upload(file.filename or "", file.content_type or "", data)
        text = extract_text(data, kind)
        if not text.strip():
            raise ResumeError("No readable text was found in this file (scanned images are not supported).")
    except ResumeError as exc:
        raise AppError(422, "validation_error", str(exc), {"reason": "resume_rejected"})
    finally:
        del data
    vocab = [r["name"] for r in db.all("select name from public.skills")]
    ex = parse_resume(text, vocab)
    p = profiles_svc.get_profile(db, user.id)
    have = set(p["skills"])
    known_items = {(r["kind"], r["text"]) for r in db.all("select kind, text from public.profile_items where profile_id = cast(:u as uuid)", u=user.id)}
    new_skills = [s for s in ex["skills"] if s["name"] not in have]
    return {
        "method": "rule-based extraction (section headings, patterns, controlled skill vocabulary) — not an AI model; please review everything",
        "extracted": {**ex, "skills": ex["skills"], "items": {k: [t for t in ex[k] if (KINDS[k], t[:400]) not in known_items] for k in KINDS}},
        "diff": {"newSkills": new_skills, "alreadyConfirmed": [s["name"] for s in ex["skills"] if s["name"] in have], "nameDiffers": bool(ex["name"] and ex["name"] != p["full_name"]),
                 "currentName": p["full_name"], "newLinks": [l for l in ex["links"] if l not in (p.get("links") or {}).values()]},
        "willChange": "Nothing yet. Choose what to keep and confirm.",
    }


class ConfirmIn(ApiModel):
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    confirm_skills: list[str] = Field(default_factory=list, max_length=60)        # I really have these → confirmed
    suggest_skills: list[dict] = Field(default_factory=list, max_length=60)       # keep as inferred suggestions with their evidence
    update_name: Optional[str] = Field(None, max_length=120)
    links: dict[str, str] = Field(default_factory=dict)
    items: dict[str, list[str]] = Field(default_factory=dict)


class ConfirmOut(ApiModel):
    changed: dict
    profile: ProfileOut


@router.post("/confirm", response_model=ConfirmOut, summary="Apply exactly the parts of the extraction you approved")
def confirm(body: ConfirmIn, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    if set(body.items) - set(KINDS):
        raise bad_request("Unknown item group", {"allowed": sorted(KINDS)})
    cur = profiles_svc.get_profile(db, user.id)
    changed = {"skills": 0, "inferred": 0, "items": 0, "name": False, "links": 0}
    if body.confirm_skills:
        profiles_svc.set_confirmed_skills(db, user.id, sorted(set(cur["skills"]) | {s.lower() for s in body.confirm_skills}), source="resume")
        changed["skills"] = len(set(s.lower() for s in body.confirm_skills) - set(cur["skills"]))
    if body.suggest_skills:
        items = [{"skill": str(s.get("name", "")).lower(), "source": "resume", "evidence": str(s.get("evidence") or "Found in resume")[:500], "confidence": 0.6}
                 for s in body.suggest_skills if str(s.get("name", "")).lower() not in set(cur["skills"])]
        changed["inferred"] = profiles_svc.add_inferred_skills(db, user.id, items)
    if body.update_name and body.update_name.strip():
        db.run("update public.profiles set full_name = :n where id = cast(:u as uuid)", n=body.update_name.strip()[:120], u=user.id); changed["name"] = True
    if body.links:
        allowed = {k: v for k, v in body.links.items() if k in ("github", "linkedin", "portfolio", "other") and v.startswith(("https://", "http://")) and len(v) <= 300}
        db.run("update public.profiles set links = links || cast(:l as jsonb) where id = cast(:u as uuid)", l=__import__("json").dumps(allowed), u=user.id); changed["links"] = len(allowed)
    for group, texts in body.items.items():
        for t in texts[:20]:
            t = t.strip()[:400]
            if t:
                changed["items"] += db.run("insert into public.profile_items (profile_id, kind, text, source) values (cast(:u as uuid), :k, :t, 'resume') on conflict do nothing", u=user.id, k=KINDS[group], t=t)
    log_activity(db, user.id, "profile_updated", "Updated profile from resume", "/profile")
    return {"changed": changed, "profile": profiles_svc.get_profile(db, user.id)}
