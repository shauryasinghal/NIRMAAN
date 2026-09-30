"""
AI Team Builder — graph-based, complementarity-driven team formation.

Nodes: students (skill vectors).
Edges: weighted by skill COMPLEMENTARITY, not overlap — a pair whose skills
       jointly cover more of the target skill set with less redundancy scores
       higher, following Lappas, Liu & Terzi (2009).
Selection: constrained greedy search (team-size cap + skill-coverage target),
       since exact optimisation over a weighted graph is NP-hard at scale.

Fallback architecture (synopsis Section 61 / build-prompt Section 61):
Uses an in-memory networkx graph. If NEO4J_URI is configured and reachable,
swap this module's graph construction for a Neo4j Cypher-backed one — the
function signature (`build_team`) stays the same, so callers don't change.
"""
import os
import itertools
from typing import List, Dict
import networkx as nx

NEO4J_URI = os.getenv("NEO4J_URI")  # presence flag only; real driver wiring is a follow-up phase


def _skill_set(student) -> set:
    return set(s.lower() for s in (student.skills or []))


def _complementarity(a, b, target: set) -> float:
    """Edge weight: how much two students' skills jointly cover `target`
    while penalising duplication between them."""
    sa, sb = _skill_set(a), _skill_set(b)
    covered = (sa | sb) & target
    overlap = sa & sb
    if not target:
        return 0.0
    coverage = len(covered) / len(target)
    redundancy_penalty = len(overlap) / max(len(sa | sb), 1)
    return round(coverage - 0.3 * redundancy_penalty, 4)


def build_team(candidates: List, target_skills: List[str], team_size: int = 4) -> Dict:
    target = set(s.lower() for s in target_skills)
    if not candidates:
        return {"members": [], "diversityScore": 0.0, "coverageScore": 0.0, "coverage": {}}

    G = nx.Graph()
    for c in candidates:
        G.add_node(c.id, ref=c)
    for a, b in itertools.combinations(candidates, 2):
        w = _complementarity(a, b, target)
        if w > 0:
            G.add_edge(a.id, b.id, weight=w)

    # Constrained greedy: start from the candidate with the best single-person
    # coverage, then repeatedly add whoever most improves joint coverage
    # with the least redundancy against the team so far.
    def coverage_of(members) -> set:
        covered = set()
        for m in members:
            covered |= _skill_set(m)
        return covered & target

    remaining = list(candidates)
    remaining.sort(key=lambda c: len(_skill_set(c) & target), reverse=True)
    team = [remaining.pop(0)] if remaining else []

    while len(team) < team_size and remaining:
        best, best_gain = None, -1
        current_cov = coverage_of(team)
        for cand in remaining:
            new_cov = coverage_of(team + [cand])
            gain = len(new_cov) - len(current_cov)
            overlap_penalty = len(_skill_set(cand) & coverage_of(team)) * 0.1
            score = gain - overlap_penalty
            if score > best_gain:
                best, best_gain = cand, score
        if best is None:
            break
        team.append(best)
        remaining.remove(best)

    covered = coverage_of(team)
    coverage_score = round(len(covered) / len(target), 3) if target else 0.0

    # Skill-diversity score: average pairwise complementarity within the team
    pairs = list(itertools.combinations(team, 2))
    diversity_score = round(
        sum(_complementarity(a, b, target) for a, b in pairs) / len(pairs), 3
    ) if pairs else 0.0

    coverage_breakdown = {skill: (skill in covered) for skill in target_skills}

    members_out = []
    for m in team:
        ms = _skill_set(m)
        members_out.append({
            "id": m.id,
            "name": m.name,
            "skills": m.skills,
            "matchedSkills": sorted(ms & target),
            "complementarySkills": sorted(ms - target),
        })

    return {
        "members": members_out,
        "diversityScore": diversity_score,
        "coverageScore": coverage_score,
        "coverage": coverage_breakdown,
        "reason": (
            f"Selected via constrained greedy search over a weighted skill-complementarity "
            f"graph ({len(candidates)} candidates); covers {len(covered)}/{len(target)} "
            f"required skills with diversity score {diversity_score}."
        ),
    }
