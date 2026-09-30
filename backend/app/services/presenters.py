"""Row → API dict. Demo listings never expose outbound links (they'd point real organisations at events they don't run)."""
from __future__ import annotations

import datetime as dt

from ..db.session import Db
from ..engines.types import FitResult
from .common import today


def urgency(deadline: dt.date | None) -> dict:
    if deadline is None:
        return {"days_remaining": None, "urgency": "unknown", "is_expired": False}
    days = (deadline - today()).days
    band = "expired" if days < 0 else "critical" if days <= 3 else "soon" if days <= 10 else "open"
    return {"days_remaining": days, "urgency": band, "is_expired": days < 0}


def urgency_c(deadline: dt.date | None) -> dict:
    u = urgency(deadline)
    return {"daysRemaining": u["days_remaining"], "urgency": u["urgency"], "isExpired": u["is_expired"]}


def fit_summary(f: FitResult) -> dict:
    return {"overall": f.overall, "confidence": f.confidence, "matchedSkills": f.matched_skills, "missingSkills": f.missing_skills,
            "reasons": f.reasons[:4], "concerns": f.concerns[:3], "expired": f.expired}


def fit_detail(f: FitResult) -> dict:
    d = f.as_dict()
    return {**fit_summary(f), "opportunityId": d["opportunityId"], "components": d["components"],
            "preferredMatched": f.preferred_matched, "preferredMissing": f.preferred_missing, "reasons": f.reasons, "concerns": f.concerns}


def card(r: dict, fit: FitResult | None = None, saved: bool = False, app_status: str | None = None) -> dict:
    demo = r["source_type"] == "dev_seed"
    return {
        "id": r["id"], "title": r["title"], "organization": r["organization"], "organizationSlug": r["organization_slug"],
        "category": r["category"], "subcategory": r["subcategory"], "domain": r.get("domain_label"), "domainLabel": r.get("domain_label"),
        "tags": r["tags"] or [], "requiredSkills": r["required_skills"], "preferredSkills": r["preferred_skills"],
        "difficulty": r["difficulty"], "format": r["format"], "workMode": r["work_mode"], "participation": r["participation"],
        "minTeamSize": r["min_team_size"], "maxTeamSize": r["max_team_size"], "deadline": r["deadline"], **urgency_c(r["deadline"]),
        "location": r["location"], "prizeText": r["prize_text"], "stipendAmount": r["stipend_amount"], "stipendCurrency": r["stipend_currency"],
        "salaryText": r["salary_text"], "certificate": r["certificate"], "source": "Demo data" if demo else r["source"], "sourceType": r["source_type"],
        "isDemo": demo, "verificationStatus": "unverified" if demo else r["verification_status"], "freshnessStatus": "unknown" if demo else r["freshness_status"],
        "lastVerifiedAt": None if demo else r["last_verified_at"], "officialUrl": None if demo else r["external_url"],
        "saved": saved, "applicationStatus": app_status, "fit": fit_summary(fit) if fit else None,
    }


def user_flags(db: Db, user_id: str, ids: list[str]) -> tuple[set[str], dict[str, str]]:
    if not ids:
        return set(), {}
    saved = {r["id"] for r in db.all("select opportunity_id::text as id from public.saved_opportunities where student_id = cast(:u as uuid) and opportunity_id = any(cast(:i as uuid[]))", u=user_id, i=ids)}
    apps = {r["id"]: r["status"] for r in db.all("select opportunity_id::text as id, status::text as status from public.applications where student_id = cast(:u as uuid) and opportunity_id = any(cast(:i as uuid[]))", u=user_id, i=ids)}
    return saved, apps
