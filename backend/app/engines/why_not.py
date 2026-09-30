"""Why-Not: what is actually standing between this student and this opportunity.

Only fields that exist and are structured can create a blocker — free-text eligibility is *shown* as
something to verify, never silently turned into a pass/fail. Each blocker carries `impact`: the fit points
the student would gain if that blocker were resolved, computed by re-scoring with that one change.
"""
from __future__ import annotations

import dataclasses

from .display import label, labels, plural

from .recommender import score_fit
from .types import LEVELS, FitContext, FitResult, OppSignals, StudentSignals

_EDU_ORDER = ["high_school", "undergraduate", "postgraduate", "phd"]
_EDU_WORDS = {"high_school": ("high school", "school student", "class 11", "class 12"),
              "undergraduate": ("undergraduate", "b.tech", "btech", "bachelor", "ug "),
              "postgraduate": ("postgraduate", "m.tech", "mtech", "master", "mba", "pg "),
              "phd": ("phd", "ph.d", "doctoral")}


def _edu_mismatch(student_level: str | None, text: str | None) -> str | None:
    if not text or not student_level or student_level not in _EDU_ORDER:
        return None
    low = text.lower()
    mentioned = [lvl for lvl, words in _EDU_WORDS.items() if any(w in low for w in words)]
    if mentioned and student_level not in mentioned:
        return f"This listing mentions {', '.join(m.replace('_', ' ') for m in mentioned)} education; your profile says {student_level.replace('_', ' ')}."
    return None


def explain_blockers(s: StudentSignals, o: OppSignals, fit: FitResult, ctx: FitContext) -> dict:
    base = fit.overall
    blockers: list[dict] = []

    def gain(new_s: StudentSignals | None = None, new_o: OppSignals | None = None) -> float:
        return round(max(0.0, score_fit(new_s or s, new_o or o, ctx).overall - base), 1)

    for skill in fit.missing_skills:
        blockers.append({"kind": "missing_skill", "severity": "blocker", "title": f"{label(skill)} missing",
                         "detail": f"This opportunity requires {label(skill)}, which isn't among your confirmed skills.",
                         "fix": f"Learn {label(skill)}, or add a teammate who has it." + (" You have an inferred match — confirm it if it's accurate." if skill in s.inferred_skills else ""),
                         "impact": gain(dataclasses.replace(s, skills=s.skills | {skill}))})

    if o.deadline is not None:
        days = (o.deadline - ctx.today).days
        if days < 0:
            blockers.append({"kind": "deadline", "severity": "blocker", "title": "Deadline passed",
                             "detail": f"Registration closed {abs(days)} day(s) ago.", "fix": "Watch for the next edition or similar listings.", "impact": 0.0})
        elif days <= 3:
            blockers.append({"kind": "deadline", "severity": "warning", "title": f"Deadline in {days} day(s)",
                             "detail": "Very little time left to prepare and register.", "fix": "Decide today whether to go for it.", "impact": 0.0})

    gap = (LEVELS[o.difficulty] - LEVELS.get(s.level, 0)) if o.difficulty in LEVELS else 0
    if gap >= 1:
        blockers.append({"kind": "difficulty", "severity": "blocker" if gap >= 2 else "warning", "title": f"{o.difficulty.capitalize()} difficulty",
                         "detail": f"Marked {o.difficulty}; your profile says {s.level}.",
                         "fix": "Team up with someone more experienced, or build a stepping-stone project first.",
                         "impact": gain(dataclasses.replace(s, level=o.difficulty))})

    if o.participation == "team" and s.participation_pref == "individual":
        size = f"{o.min_team}–{o.max_team}" if o.min_team and o.max_team else (str(o.min_team) if o.min_team else "a team")
        blockers.append({"kind": "team_size", "severity": "warning", "title": f"Team required ({size})",
                         "detail": f"This is team-based and you prefer working individually.",
                         "fix": "Use Team Builder to assemble a team from this opportunity's required skills.",
                         "impact": gain(dataclasses.replace(s, participation_pref="either"))})
    elif o.min_team and o.min_team > 1 and s.participation_pref != "individual":
        blockers.append({"kind": "team_size", "severity": "info", "title": f"Needs at least {o.min_team} people",
                         "detail": f"Teams must have {o.min_team}" + (f"–{o.max_team}" if o.max_team else "+") + " members.",
                         "fix": "Build a team before you apply.", "impact": 0.0})

    if o.format and s.preferred_format and o.format != s.preferred_format and "hybrid" not in (o.format, s.preferred_format):
        blockers.append({"kind": "format", "severity": "warning", "title": f"{o.format.capitalize()} event",
                         "detail": f"You prefer {s.preferred_format}; this is {o.format}.", "fix": "Check whether attending remotely is allowed.",
                         "impact": gain(dataclasses.replace(s, preferred_format=o.format))})

    if o.format in ("offline", "hybrid") and o.location and s.location:
        a, b = s.location.lower(), o.location.lower()
        if not (a in b or b in a or set(a.replace(",", " ").split()) & set(b.replace(",", " ").split())):
            blockers.append({"kind": "location", "severity": "warning", "title": f"In person in {o.location}",
                             "detail": f"Your profile location is {s.location}.", "fix": "Confirm travel is feasible.", "impact": 0.0})

    edu = _edu_mismatch(s.education_level, o.education_requirements) or _edu_mismatch(s.education_level, o.eligibility)
    if edu:
        blockers.append({"kind": "eligibility", "severity": "warning", "title": "Check eligibility", "detail": edu,
                         "fix": "Read the official eligibility criteria before applying.", "impact": 0.0})

    dom = next((c for c in fit.components if c.key == "domain"), None)
    if o.domain and s.interests and o.domain not in s.interests and dom and dom.score is not None and dom.score < 0.2:
        blockers.append({"kind": "domain_mismatch", "severity": "info", "title": "Outside your usual domain",
                         "detail": f"{o.domain} isn't among your interests and your skills overlap little with it.",
                         "fix": "Only worth it if you want to explore a new domain.", "impact": gain(dataclasses.replace(s, interests=s.interests | {o.domain}))})

    order = {"blocker": 0, "warning": 1, "info": 2}
    blockers.sort(key=lambda b: (order[b["severity"]], -b["impact"], b["kind"], b["title"]))
    return {"fitScore": base, "blockers": blockers, "mainBlockers": [b["title"] for b in blockers if b["severity"] != "info"][:3],
            "verify": [t for t in (o.eligibility,) if t]}
