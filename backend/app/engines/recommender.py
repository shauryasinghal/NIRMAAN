"""Explainable fit engine.

overall = 100 × Σ(wᵢ·sᵢ) / Σ(wᵢ) over the signals we actually KNOW. An unknown input (no deadline listed,
no format preference, too little activity for behavioural affinity …) is excluded and the remaining
weights are renormalised — it is never replaced by a made-up neutral value. `confidence` reports how much
of the total weight was known.

Signals and weights (sum = 1.00):
  skill match ............ 0.30  confirmed skills vs required (80%) / preferred (20%)
  interest match ......... 0.12  student interests vs the opportunity's domain / tags
  domain alignment ....... 0.10  cosine(student skills, the skill profile of that domain in the live catalog)
  experience alignment ... 0.12  student level vs opportunity difficulty
  participation .......... 0.06  individual / team preference vs the format of participation
  format preference ...... 0.05  online / offline / hybrid preference (+ location for in-person events)
  deadline feasibility ... 0.12  days left vs estimated lead time given availability
  behavioural affinity ... 0.13  what the student actually views / saves / applies to / dismisses

Same inputs → same output: no randomness, no wall-clock reads (`today` is injected).
"""
from __future__ import annotations

import math

from .types import LEVELS, Affinity, Component, FitContext, FitResult, OppSignals, StudentSignals

WEIGHTS = {
    "skill": 0.30, "interest": 0.12, "domain": 0.10, "experience": 0.12,
    "participation": 0.06, "format": 0.05, "deadline": 0.12, "behavior": 0.13,
}
MIN_EVENTS_FOR_AFFINITY = 5
LEAD_DAYS = {"beginner": 5, "intermediate": 10, "advanced": 18}
EXPIRED_CAP = 30.0


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def skill_component(s: StudentSignals, o: OppSignals) -> Component:
    req, pref = o.required, o.preferred
    m_req, m_pref = sorted(req & s.skills), sorted(pref & s.skills)
    if not req and not pref:
        return Component("skill", "Skill match", WEIGHTS["skill"], None, "This listing doesn't state required skills.")
    if req and pref:
        score = 0.8 * len(m_req) / len(req) + 0.2 * len(m_pref) / len(pref)
    elif req:
        score = len(m_req) / len(req)
    else:
        score = len(m_pref) / len(pref)
    parts = []
    if req:
        parts.append(f"{len(m_req)}/{len(req)} required skills")
    if pref:
        parts.append(f"{len(m_pref)}/{len(pref)} preferred")
    return Component("skill", "Skill match", WEIGHTS["skill"], score, ", ".join(parts))


def interest_component(s: StudentSignals, o: OppSignals) -> Component:
    w = WEIGHTS["interest"]
    if not s.interests:
        return Component("interest", "Interest match", w, None, "You haven't picked any interests yet.")
    if not o.domain and not o.tags:
        return Component("interest", "Interest match", w, None, "This listing has no domain or tags.")
    if o.domain and o.domain in s.interests:
        return Component("interest", "Interest match", w, 1.0, f"{o.domain} is one of your interests")
    tokens = {t for i in s.interests for t in i.replace("/", " ").split()}
    tag_hits = sorted({t.lower() for t in o.tags} & s.interests | ({t.lower() for t in o.tags} & tokens))
    if tag_hits:
        return Component("interest", "Interest match", w, _clamp(0.5 + 0.25 * len(tag_hits)), f"tags overlap your interests: {', '.join(tag_hits[:3])}")
    return Component("interest", "Interest match", w, 0.0, f"{o.domain or 'This domain'} isn't among your interests")


def domain_component(s: StudentSignals, o: OppSignals, ctx: FitContext) -> Component:
    w = WEIGHTS["domain"]
    profile = ctx.domain_profiles.get(o.domain or "")
    if not profile or not s.skills:
        return Component("domain", "Domain alignment", w, None, "Not enough data to compare your skills with this domain.")
    norm = math.sqrt(sum(v * v for v in profile.values())) * math.sqrt(len(s.skills))
    score = _clamp(sum(profile.get(k, 0.0) for k in s.skills) / norm) if norm else 0.0
    label = "Strong" if score >= 0.6 else "Moderate" if score >= 0.3 else "Weak"
    return Component("domain", "Domain alignment", w, score, f"{label} overlap between your skills and typical {o.domain} requirements")


def experience_component(s: StudentSignals, o: OppSignals) -> Component:
    diff = LEVELS.get(s.level, 0) - LEVELS.get(o.difficulty, 1)
    score = {0: 1.0, 1: 0.85, 2: 0.7, -1: 0.5, -2: 0.15}[diff]
    detail = ("Difficulty matches your experience" if diff == 0 else
              f"Below your level ({o.difficulty} vs your {s.level})" if diff > 0 else
              f"Above your level ({o.difficulty} vs your {s.level})")
    return Component("experience", "Experience alignment", WEIGHTS["experience"], score, detail)


def participation_component(s: StudentSignals, o: OppSignals) -> Component:
    w = WEIGHTS["participation"]
    if o.participation is None:
        return Component("participation", "Participation", w, None, "Participation type isn't listed.")
    if s.participation_pref == "either" or s.participation_pref == o.participation:
        return Component("participation", "Participation", w, 1.0, f"{o.participation.capitalize()} participation fits your preference")
    return Component("participation", "Participation", w, 0.3, f"This is {o.participation}-based; you prefer {s.participation_pref}")


def format_component(s: StudentSignals, o: OppSignals) -> Component:
    w = WEIGHTS["format"]
    if not s.preferred_format or not o.format:
        return Component("format", "Format", w, None, "Format preference or listing format unknown.")
    if s.preferred_format == o.format:
        score, detail = 1.0, f"{o.format.capitalize()} matches your preferred format"
    elif "hybrid" in (s.preferred_format, o.format):
        score, detail = 0.7, f"{o.format.capitalize()} is partly compatible with your {s.preferred_format} preference"
    else:
        score, detail = 0.2, f"{o.format.capitalize()} conflicts with your {s.preferred_format} preference"
    if o.format in ("offline", "hybrid") and o.location and s.location and not _same_place(s.location, o.location):
        score = min(score, 0.3)
        detail += f"; event is in {o.location}"
    return Component("format", "Format", w, score, detail)


def _same_place(a: str, b: str) -> bool:
    a, b = a.lower().strip(), b.lower().strip()
    return a in b or b in a or bool(set(a.replace(",", " ").split()) & set(b.replace(",", " ").split()))


def deadline_component(s: StudentSignals, o: OppSignals, ctx: FitContext) -> Component:
    w = WEIGHTS["deadline"]
    if o.deadline is None:
        return Component("deadline", "Deadline feasibility", w, None, "No deadline listed.")
    days = (o.deadline - ctx.today).days
    if days < 0:
        return Component("deadline", "Deadline feasibility", w, 0.0, "The registration deadline has passed")
    lead = LEAD_DAYS.get(o.difficulty, 10) * _clamp(10 / max(s.availability_hrs, 1), 0.5, 2.0)
    score = _clamp(days / lead)
    detail = f"{_plural(days, 'day')} left; ~{round(lead)} days of lead time suggested at {s.availability_hrs} h/week"
    return Component("deadline", "Deadline feasibility", w, score, detail)


def behavior_component(s: StudentSignals, o: OppSignals, ctx: FitContext) -> Component:
    w, a = WEIGHTS["behavior"], ctx.affinity
    if o.id in a.dismissed:
        return Component("behavior", "Your activity", w, 0.0, "You dismissed this opportunity")
    if a.n_events < MIN_EVENTS_FOR_AFFINITY:
        return Component("behavior", "Your activity", w, None, f"Not enough activity yet ({a.n_events}/{MIN_EVENTS_FOR_AFFINITY} actions) to personalise from behaviour.")

    def norm(dist: dict[str, float], key: str | None) -> float:
        if not key or not dist:
            return 0.0
        top = max(dist.values())
        return _clamp(dist.get(key, 0.0) / top) if top > 0 else 0.0

    cat, dom = norm(a.category, o.category), norm(a.domain, o.domain)
    skills = [norm(a.skill, k) for k in (o.required | o.preferred)]
    sk = sum(skills) / len(skills) if skills else 0.0
    score = 0.4 * cat + 0.3 * dom + 0.3 * sk
    bits = [b for b, v in (("category", cat), ("domain", dom), ("skills", sk)) if v >= 0.5]
    detail = f"Similar to what you engage with ({', '.join(bits)})" if bits else "Little overlap with what you've engaged with so far"
    return Component("behavior", "Your activity", w, score, detail)


def score_fit(s: StudentSignals, o: OppSignals, ctx: FitContext) -> FitResult:
    comps = [
        skill_component(s, o), interest_component(s, o), domain_component(s, o, ctx), experience_component(s, o),
        participation_component(s, o), format_component(s, o), deadline_component(s, o, ctx), behavior_component(s, o, ctx),
    ]
    known = [c for c in comps if c.score is not None]
    total_w = sum(c.weight for c in known)
    overall = 100.0 * sum(c.weight * c.score for c in known) / total_w if total_w else 0.0
    expired = bool(o.deadline and o.deadline < ctx.today)
    if expired:
        overall = min(overall, EXPIRED_CAP)
    known_w = sum(c.weight for c in known)
    confidence = "high" if known_w >= 0.8 else "medium" if known_w >= 0.5 else "low"

    matched, missing = sorted(o.required & s.skills), sorted(o.required - s.skills)
    p_matched, p_missing = sorted(o.preferred & s.skills), sorted(o.preferred - s.skills)
    result = FitResult(
        opportunity_id=o.id, overall=round(overall, 1), components=comps, matched_skills=matched, missing_skills=missing,
        preferred_matched=p_matched, preferred_missing=p_missing, reasons=[], concerns=[], confidence=confidence, expired=expired,
    )
    result.reasons, result.concerns = explain(s, o, result, ctx)
    return result


def explain(s: StudentSignals, o: OppSignals, r: FitResult, ctx: FitContext) -> tuple[list[str], list[str]]:
    """Every sentence is generated from a component's own detail or a counted fact — no canned praise."""
    by = {c.key: c for c in r.components}
    reasons: list[str] = []
    if o.required and r.matched_skills:
        reasons.append(f"{len(r.matched_skills)}/{len(o.required)} required skills: {', '.join(r.matched_skills[:4])}")
    if by["interest"].score == 1.0:
        reasons.append(by["interest"].detail.capitalize())
    if (by["domain"].score or 0) >= 0.6:
        reasons.append(f"Strong {o.domain} alignment with your skills")
    if by["experience"].score == 1.0:
        reasons.append("Difficulty matches your experience")
    if by["participation"].score == 1.0 and o.participation and s.participation_pref != "either":
        reasons.append(by["participation"].detail)
    if by["format"].score == 1.0:
        reasons.append("Preferred format")
    if (by["behavior"].score or 0) >= 0.6:
        reasons.append(by["behavior"].detail)
    if by["deadline"].score is not None and by["deadline"].score >= 0.999:
        reasons.append("Enough time before the deadline")

    concerns: list[str] = []
    if r.expired:
        concerns.append("The registration deadline has passed")
    elif o.deadline is not None:
        days = (o.deadline - ctx.today).days
        if days <= 3:
            concerns.append(f"Deadline in {_plural(days, 'day')}")
        elif (by["deadline"].score or 1) < 0.5:
            concerns.append(f"Tight timeline: {by['deadline'].detail}")
    if r.missing_skills:
        concerns.append(f"Missing {_plural(len(r.missing_skills), 'required skill')}: {', '.join(r.missing_skills[:4])}")
    if (by["experience"].score or 1) <= 0.5:
        concerns.append(by["experience"].detail)
    if (by["format"].score is not None) and by["format"].score <= 0.3:
        concerns.append(by["format"].detail)
    if by["participation"].score is not None and by["participation"].score < 0.5:
        concerns.append(by["participation"].detail)
    if r.confidence == "low":
        concerns.append("Low confidence: several inputs are unknown — complete your profile for a sharper score")
    return reasons, concerns


def build_domain_profiles(rows: list[tuple[str, str, int]]) -> dict[str, dict[str, float]]:
    """rows = (domain, skill, count) aggregated from the live catalog → per-domain skill weights.
    Weight = tf·idf where tf is the skill's share within the domain and idf discounts skills required everywhere."""
    per_domain: dict[str, dict[str, int]] = {}
    for d, sk, n in rows:
        per_domain.setdefault(d, {})[sk] = per_domain.get(d, {}).get(sk, 0) + n
    n_domains = max(len(per_domain), 1)
    df: dict[str, int] = {}
    for skills in per_domain.values():
        for sk in skills:
            df[sk] = df.get(sk, 0) + 1
    out: dict[str, dict[str, float]] = {}
    for d, skills in per_domain.items():
        total = sum(skills.values()) or 1
        out[d] = {sk: (n / total) * (1 + math.log((1 + n_domains) / (1 + df[sk]))) for sk, n in skills.items()}
    return out


def build_affinity(events: list[dict], opp_index: dict[str, OppSignals], today, half_life_days: float = 21.0) -> Affinity:
    """events: [{type, opportunity_id, days_ago}] → decayed distributions. Weights are shown to the user on the
    'What shapes your recommendations' panel, so they are deliberately simple."""
    type_weight = {"application_submit": 3.0, "application_start": 2.0, "save": 1.5, "compare": 1.0,
                   "opportunity_view": 0.5, "alert_create": 1.0, "unsave": -1.0}
    cat: dict[str, float] = {}; dom: dict[str, float] = {}; sk: dict[str, float] = {}
    dismissed: set[str] = set()
    n = 0
    for e in events:
        oid, et = e.get("opportunity_id"), e["type"]
        if et == "dismiss" and oid:
            dismissed.add(oid)
        w = type_weight.get(et)
        o = opp_index.get(oid) if oid else None
        if w is None or o is None:
            continue
        n += 1
        w *= 0.5 ** (e.get("days_ago", 0) / half_life_days)
        if o.category:
            cat[o.category] = cat.get(o.category, 0.0) + w
        if o.domain:
            dom[o.domain] = dom.get(o.domain, 0.0) + w
        for k in o.required | o.preferred:
            sk[k] = sk.get(k, 0.0) + w
    clip = lambda d: {k: v for k, v in d.items() if v > 0}
    return Affinity(n_events=n, category=clip(cat), domain=clip(dom), skill=clip(sk), dismissed=frozenset(dismissed))
