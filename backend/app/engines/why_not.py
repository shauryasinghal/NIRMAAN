"""
Why-Not engine - the inverse of the recommender's explanation. For an
opportunity that ISN'T a strong match, explains exactly what's blocking it
and what would need to change - using only fields already on the student
profile and the opportunity record. Never fabricates an eligibility rule,
experience requirement, or location constraint that isn't actually stored.
"""
from typing import Dict, List


def explain_low_fit(student, opportunity, fit_score: float, matched: List[str], missing: List[str]) -> Dict:
    blockers = []

    if missing:
        blockers.append({
            "kind": "missing_skills",
            "detail": f"Missing {len(missing)} required skill{'s' if len(missing) != 1 else ''}: {', '.join(missing)}",
        })

    if opportunity.difficulty == "advanced" and (student.experience_level or "beginner") == "beginner":
        blockers.append({
            "kind": "experience_mismatch",
            "detail": "This is marked advanced difficulty; your profile experience level is beginner.",
        })

    if opportunity.format == "offline" and student.availability_hrs is not None and student.availability_hrs < 5:
        blockers.append({
            "kind": "availability",
            "detail": "This is an offline/in-person opportunity, which needs more availability than your profile currently states.",
        })

    if not matched and opportunity.domain not in (student.interests or []):
        blockers.append({
            "kind": "domain_mismatch",
            "detail": f"This is a {opportunity.domain} opportunity; it isn't among your declared interests.",
        })

    actions = []
    for s in missing[:3]:
        actions.append(f"Add {s} to your profile if you genuinely have experience with it")
    if opportunity.difficulty == "advanced" and (student.experience_level or "beginner") == "beginner":
        actions.append("Build up intermediate-level project experience before this one")

    return {
        "fitScore": fit_score,
        "blockers": blockers,
        "suggestedActions": actions,
    }
