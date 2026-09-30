"""Team Builder and Recommender evaluation against baselines, using the same demo data the app seeds.

  Team Builder : NIRMAAN team vs random teams of the same size — required-skill coverage and balance score.
  Recommender  : personas ranked over the demo catalog — P@10 / NDCG@10 vs a recency baseline and a random baseline.

HONEST LIMITS. There is no real interaction data yet, so the recommender's "relevance" here is a synthetic label
(an opportunity is relevant to a persona when its domain is one the persona targets AND it shares >= 2 required
skills, or it shares >= 3). That is a CONSISTENCY check — does the ranker put clearly on-profile items first? — not
proof of real-world relevance; real precision needs click/apply feedback. The team-builder comparison is a fair
head-to-head (same candidates, same opportunities, only the selection rule differs).

    python -m eval.engines_eval
"""
from __future__ import annotations

import datetime as dt
import json
import math
import random
from pathlib import Path

import numpy as np

from app.devseed import ARCHETYPES, FIRST, LAST
from app.engines.recommender import build_domain_profiles, score_fit
from app.engines.team_builder import Member, build_team, team_metrics
from app.engines.types import FitContext, OppSignals, StudentSignals

FX = Path(__file__).resolve().parents[1] / "fixtures"
TODAY = dt.date(2026, 9, 30)


def demo_members(n: int = 24) -> list[Member]:
    out = []
    for i in range(n):
        _, skills, interest = ARCHETYPES[i % len(ARCHETYPES)]
        out.append(Member(id=f"m{i}", name=f"{FIRST[i % len(FIRST)]} {LAST[(i * 3) % len(LAST)]}", skills=frozenset(skills), interests=frozenset({interest.lower()}),
                          level=["beginner", "intermediate", "advanced"][i % 3], availability_hrs=5 + (i % 6) * 3))
    return out


def fixture_opps() -> list[dict]:
    return json.loads((FX / "opportunities.dev.json").read_text())


def team_eval(draws: int = 300, size: int = 4, seed: int = 7) -> dict:
    rng = random.Random(seed)
    members = demo_members()
    tasks = [o for o in fixture_opps() if o.get("participation") == "team" and len(o.get("requiredSkills", [])) >= 3]
    rows = []
    for o in tasks:
        R = [s.lower() for s in o["requiredSkills"]]; P = [s.lower() for s in o.get("preferredSkills", [])]
        owner = members[rng.randrange(len(members))]
        pool = [m for m in members if m.id != owner.id]
        mine = build_team(R, P, owner, pool, size)
        team = [owner] + [next(m for m in pool if m.id == x["id"]) for x in mine["members"] if not x.get("isYou")]
        ours = team_metrics(team, frozenset(R))
        rand_cov, rand_score = [], []
        for _ in range(draws):
            t = [owner] + rng.sample(pool, size - 1)
            mm = team_metrics(t, frozenset(R)); rand_cov.append(mm["skillCoverage"]); rand_score.append(mm["score"])
        rows.append({"coverage": ours["skillCoverage"], "score": ours["score"], "size": len(team), "rand_cov": float(np.mean(rand_cov)), "rand_score": float(np.mean(rand_score)),
                     "full": ours["skillCoverage"] == 1.0, "rand_full": float(np.mean([c == 1.0 for c in rand_cov]))})
    a = lambda k: float(np.mean([r[k] for r in rows]))
    return {"opportunities": len(rows), "team_size_max": size, "random_draws_each": draws,
            "coverage": {"nirmaan": a("coverage"), "random": a("rand_cov")}, "balance_score": {"nirmaan": a("score"), "random": a("rand_score")},
            "fully_covered_share": {"nirmaan": a("full"), "random": a("rand_full")}, "avg_team_size": a("size")}


def to_signals(o: dict, i: int) -> OppSignals:
    return OppSignals(id=f"o{i}", title=o["title"], organization=o["organization"], domain=(o.get("domain") or "").lower() or None, category=o.get("category"),
                      required=frozenset(s.lower() for s in o.get("requiredSkills", [])), preferred=frozenset(s.lower() for s in o.get("preferredSkills", [])),
                      difficulty=o.get("difficulty"), format=o.get("format"), participation=o.get("participation"), min_team=o.get("minTeamSize"), max_team=o.get("maxTeamSize"),
                      deadline=TODAY + dt.timedelta(days=int(o["deadlineInDays"])) if "deadlineInDays" in o else None, location=o.get("location"))


PERSONAS = {
    "ML student": dict(skills={"python", "machine learning", "deep learning", "nlp"}, interests={"ai/ml"}, domains={"ai/ml", "data science"}, level="intermediate"),
    "Frontend dev": dict(skills={"react", "javascript", "css", "ui/ux"}, interests={"web development", "edtech"}, domains={"web development", "edtech"}, level="beginner"),
    "Security student": dict(skills={"cybersecurity", "networking", "python"}, interests={"cybersecurity"}, domains={"cybersecurity"}, level="intermediate"),
    "Cloud/DevOps": dict(skills={"cloud", "docker", "devops"}, interests={"devops", "cloud"}, domains={"devops", "cloud"}, level="intermediate"),
    "Data analyst": dict(skills={"data science", "python", "sql"}, interests={"data science"}, domains={"data science", "ai/ml"}, level="beginner"),
}


def ndcg(rels: list[int], k: int, ideal_n: int) -> float:
    dcg = sum(r / math.log2(i + 2) for i, r in enumerate(rels[:k]))
    idcg = sum(1 / math.log2(i + 2) for i in range(min(k, ideal_n)))
    return dcg / idcg if idcg else 0.0


def recommender_eval(seed: int = 11) -> dict:
    rng = random.Random(seed)
    raw = fixture_opps(); opps = [to_signals(o, i) for i, o in enumerate(raw)]
    rows = [(o.domain or "", s, 1) for o in opps for s in o.required]
    ctx = FitContext(today=TODAY, domain_profiles=build_domain_profiles([(d, s, n) for d, s, n in rows if d]))
    out = {}
    for name, p in PERSONAS.items():
        student = StudentSignals(id=name, skills=frozenset(p["skills"]), interests=frozenset(p["interests"]), level=p["level"], availability_hrs=10)
        rel = {o.id: int((o.domain in p["domains"] and len(o.required & p["skills"]) >= 2) or len(o.required & p["skills"]) >= 3) for o in opps}
        n_rel = sum(rel.values())
        ranked = sorted(opps, key=lambda o: (-score_fit(student, o, ctx).overall, o.title))
        recent = sorted(opps, key=lambda o: (o.deadline or dt.date.max, o.title))
        shuffled = opps[:]; rng.shuffle(shuffled)
        p10 = lambda seq: sum(rel[o.id] for o in seq[:10]) / 10
        nd = lambda seq: ndcg([rel[o.id] for o in seq], 10, n_rel)
        out[name] = {"relevant_in_catalog": n_rel, "P@10": {"nirmaan": p10(ranked), "recency": p10(recent), "random": p10(shuffled)}, "NDCG@10": {"nirmaan": nd(ranked), "recency": nd(recent), "random": nd(shuffled)}}
    mean = lambda m, k: float(np.mean([v[m][k] for v in out.values()]))
    return {"catalog_size": len(opps), "personas": out, "mean": {"P@10": {k: mean("P@10", k) for k in ("nirmaan", "recency", "random")}, "NDCG@10": {k: mean("NDCG@10", k) for k in ("nirmaan", "recency", "random")}}}


def determinism_check() -> bool:
    raw = fixture_opps(); opps = [to_signals(o, i) for i, o in enumerate(raw)]
    s = StudentSignals(id="x", skills=frozenset({"python", "machine learning"}), interests=frozenset({"ai/ml"}), level="intermediate")
    ctx = FitContext(today=TODAY)
    return all(score_fit(s, o, ctx).as_dict() == score_fit(s, o, ctx).as_dict() for o in opps)


def run() -> dict:
    return {"team_builder": team_eval(), "recommender": recommender_eval(), "recommender_deterministic": determinism_check()}


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
