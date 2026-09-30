"""Team Builder: opportunity requirements → coverage → gaps → ranked candidates → explained team.

Selection is greedy set-cover on *marginal contribution*: at each step the candidate whose skills add the
most uncovered required capability (plus preferred and breadth, minus redundancy, plus compatibility) joins.
It stops early when required coverage is complete and nobody adds anything, and reports honestly which
required skills no available candidate covers — it never pads a team to hit a size.

"Diversity" means capability diversity only — never demographics:
  score = 0.40·coverage + 0.25·role_diversity + 0.25·complementarity + 0.10·(1 − redundancy)
    coverage        share of required skills the team covers
    role_diversity  distinct roles ÷ team size
    complementarity mean pairwise skill-set distance (1 − Jaccard)
    redundancy      duplicate holdings of required skills ÷ all holdings
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field

from .roles import role_for_skills
from .types import LEVELS

W_COVER, W_PREF, W_BREADTH, W_COMPAT, W_REDUNDANT = 1.0, 0.3, 0.1, 0.1, 0.15
ENOUGH = 0.05


@dataclass(frozen=True)
class Member:
    id: str
    name: str
    skills: frozenset[str] = frozenset()
    interests: frozenset[str] = frozenset()
    level: str = "beginner"
    availability_hrs: int = 5


def _jaccard(a: frozenset, b: frozenset) -> float | None:
    if not a and not b:
        return None
    return len(a & b) / len(a | b)


def compatibility(c: Member, team: list[Member]) -> dict:
    parts: dict[str, float | None] = {}
    if team:
        parts["availability"] = sum(min(c.availability_hrs, m.availability_hrs) / max(c.availability_hrs, m.availability_hrs, 1) for m in team) / len(team)
        parts["experience"] = sum(1 - abs(LEVELS.get(c.level, 0) - LEVELS.get(m.level, 0)) / 2 for m in team) / len(team)
        union = frozenset().union(*(m.interests for m in team))
        parts["interests"] = _jaccard(c.interests, union)
    known = [v for v in parts.values() if v is not None]
    return {"score": round(sum(known) / len(known), 3) if known else None, "parts": {k: (None if v is None else round(v, 3)) for k, v in parts.items()}}


def _marginal(c: Member, team: list[Member], R: frozenset, P: frozenset) -> dict:
    have = frozenset().union(*(m.skills for m in team)) if team else frozenset()
    mine_req = c.skills & R
    new_req, dup_req = mine_req - have, mine_req & have
    new_pref = (c.skills & P) - have
    breadth = c.skills - R - P - have
    comp = compatibility(c, team)
    total = (W_COVER * len(new_req) / max(len(R), 1) + W_PREF * len(new_pref) / max(len(P), 1) + W_BREADTH * min(len(breadth), 3) / 3
             + W_COMPAT * (comp["score"] or 0.0) - (W_REDUNDANT * len(dup_req) / len(mine_req) if mine_req else 0.0))
    return {"total": total, "new_req": new_req, "dup_req": dup_req, "new_pref": new_pref, "breadth": breadth, "compat": comp}


def _explain_member(c: Member, m: dict, team_before: list[Member], R: frozenset) -> dict:
    role = role_for_skills(m["new_req"] | m["new_pref"] or (c.skills & R) or c.skills, prefer=set(R))
    bits = []
    if m["new_req"]:
        bits.append(f"covers {len(m['new_req'])} required skill{'s' if len(m['new_req']) != 1 else ''} the team lacked: {', '.join(sorted(m['new_req']))}")
    if m["new_pref"]:
        bits.append(f"adds preferred: {', '.join(sorted(m['new_pref']))}")
    if m["breadth"]:
        bits.append(f"broadens the team with {', '.join(sorted(m['breadth'])[:3])}")
    if not bits:
        bits.append("no new required skills — included for compatibility")
    return {
        "id": c.id, "name": c.name, "role": role, "skills": sorted(c.skills),
        "contributedSkills": sorted(m["new_req"] | m["new_pref"]), "complementarySkills": sorted(m["breadth"]),
        "overlapSkills": sorted(m["dup_req"]), "compatibility": m["compat"],
        "why": (c.name.split(" ")[0] if c.name else "This person") + " " + "; ".join(bits) + ".",
        "marginalScore": round(m["total"], 3),
    }


def team_metrics(team: list[Member], R: frozenset) -> dict:
    n = len(team)
    covered = frozenset().union(*(m.skills for m in team)) & R if team else frozenset()
    coverage = len(covered) / len(R) if R else 0.0
    roles = {role_for_skills(m.skills & R or m.skills, prefer=set(R)) for m in team}
    role_div = min(1.0, len(roles) / n) if n else 0.0
    pairs = list(itertools.combinations(team, 2))
    dists = [1 - (_jaccard(a.skills, b.skills) if _jaccard(a.skills, b.skills) is not None else 1.0) for a, b in pairs]
    complementarity = sum(dists) / len(dists) if dists else 0.0
    holdings = sum(len(m.skills & R) for m in team)
    dup = sum(max(0, sum(1 for m in team if s in m.skills) - 1) for s in R)
    redundancy = dup / holdings if holdings else 0.0
    score = 0.40 * coverage + 0.25 * role_div + 0.25 * complementarity + 0.10 * (1 - redundancy)
    return {
        "skillCoverage": round(coverage, 3), "roleDiversity": round(role_div, 3), "complementarity": round(complementarity, 3),
        "redundancy": round(redundancy, 3), "score": round(score, 3), "roles": sorted(roles),
        "formula": "0.40·coverage + 0.25·roleDiversity + 0.25·complementarity + 0.10·(1 − redundancy)",
        "note": "Measures capability diversity only (skills and roles). No personal or demographic attributes are used.",
    }


def build_team(required: list[str], preferred: list[str], owner: Member | None, candidates: list[Member], size: int,
               max_team: int | None = None) -> dict:
    R, P = frozenset(s.lower() for s in required), frozenset(s.lower() for s in preferred) - frozenset(s.lower() for s in required)
    if max_team:
        size = min(size, max_team)
    team: list[Member] = [owner] if owner else []
    pool = sorted((c for c in candidates if not owner or c.id != owner.id), key=lambda c: c.id)
    covered0 = (owner.skills & R) if owner else frozenset()

    # Ranked view of who helps most *right now* (relative to the owner alone) — shown to the user.
    ranking = []
    for c in pool:
        m = _marginal(c, team, R, P)
        ranking.append((m["total"], c.id, c, m))
    ranking.sort(key=lambda t: (-t[0], t[1]))
    ranked = [_explain_member(c, m, team, R) | {"rank": i + 1} for i, (_, _, c, m) in enumerate(ranking[:12])]

    selected: list[dict] = []
    remaining = list(pool)
    while len(team) < size and remaining:
        scored = sorted(((_marginal(c, team, R, P), c) for c in remaining), key=lambda t: (-t[0]["total"], t[1].id))
        best_m, best = scored[0]
        have = frozenset().union(*(m.skills for m in team)) if team else frozenset()
        if not best_m["new_req"] and not best_m["new_pref"] and (R <= have or best_m["total"] < ENOUGH):
            break
        selected.append(_explain_member(best, best_m, team, R))
        team.append(best)
        remaining.remove(best)

    covered = (frozenset().union(*(m.skills for m in team)) & R) if team else frozenset()
    uncovered = sorted(R - covered)
    members_out = []
    if owner:
        members_out.append({"id": owner.id, "name": owner.name, "role": role_for_skills(owner.skills & R or owner.skills, prefer=set(R)),
                            "skills": sorted(owner.skills), "contributedSkills": sorted(owner.skills & R), "complementarySkills": [],
                            "overlapSkills": [], "compatibility": {"score": None, "parts": {}}, "isYou": True,
                            "why": "You are the team lead; your confirmed skills count towards coverage."})
    members_out += selected
    metrics = team_metrics(team, R)
    if uncovered:
        msg = f"No available candidate covers: {', '.join(uncovered)}. Widen the pool, learn these, or change scope."
    elif len(team) < size:
        msg = f"Complete with {len(team)} member{'s' if len(team) != 1 else ''}: every required skill is covered, so adding more would only add redundancy."
    else:
        msg = "Every required skill is covered."
    return {
        "members": members_out, "candidates": ranked, "metrics": metrics, "coverage": {s: (s in covered) for s in sorted(R)},
        "coverageBefore": {"covered": sorted(covered0), "missing": sorted(R - covered0)},
        "uncovered": uncovered, "summary": msg, "requestedSize": size, "poolSize": len(pool),
    }
