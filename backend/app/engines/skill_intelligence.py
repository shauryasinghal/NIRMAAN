"""Skill intelligence: turn missing skills into a ranked, evidenced plan.

skill gap → opportunities it unlocks → team role that would cover it → recommended action.
`unlocks` counts relevant opportunities (fit ≥ 35) that list the skill as missing; `high_fit_unlocks`
counts those that would reach ≥ 75 fit if the skill were added (a real re-score, not a guess).
"""
from __future__ import annotations

import dataclasses

from .recommender import score_fit
from .roles import role_for_skill
from .types import FitContext, OppSignals, StudentSignals

RELEVANT_FIT = 35.0
HIGH_FIT = 75.0


def compute_skill_gaps(s: StudentSignals, opps: list[OppSignals], ctx: FitContext, evidence: dict[str, list[dict]] | None = None, limit: int = 8) -> list[dict]:
    evidence = evidence or {}
    base = {o.id: score_fit(s, o, ctx) for o in opps}
    gaps: dict[str, dict] = {}
    for o in opps:
        fit = base[o.id]
        if fit.expired or fit.overall < RELEVANT_FIT:
            continue
        for skill in fit.missing_skills:
            g = gaps.setdefault(skill, {"skill": skill, "unlocks": 0, "highFitUnlocks": 0, "opportunities": []})
            g["unlocks"] += 1
            after = score_fit(dataclasses.replace(s, skills=s.skills | {skill}), o, ctx).overall
            if after >= HIGH_FIT and fit.overall < HIGH_FIT:
                g["highFitUnlocks"] += 1
            g["opportunities"].append({"id": o.id, "title": o.title, "fitNow": fit.overall, "fitWithSkill": after})
    out = []
    for g in gaps.values():
        g["opportunities"].sort(key=lambda x: (-(x["fitWithSkill"] - x["fitNow"]), x["title"]))
        g["opportunities"] = g["opportunities"][:3]
        g["teamRole"] = role_for_skill(g["skill"])
        ev = evidence.get(g["skill"], [])
        g["inferred"] = g["skill"] in s.inferred_skills
        g["evidence"] = ev[:2]
        if g["inferred"]:
            g["action"] = f"Confirm {g['skill']} on your profile if you really have it — a {ev[0]['source'] if ev else 'system'} signal suggested it."
        else:
            g["action"] = f"Learn {g['skill']}, or recruit a {g['teamRole']} for the {g['unlocks']} opportunit{'y' if g['unlocks'] == 1 else 'ies'} it affects."
        out.append(g)
    out.sort(key=lambda g: (-g["highFitUnlocks"], -g["unlocks"], g["skill"]))
    return out[:limit]
