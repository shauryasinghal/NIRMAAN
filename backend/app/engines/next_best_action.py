"""
Next Best Action engine. Looks at what's actually true about the student
right now - real recommendations, real saved items, real applications, real
originality history - and returns a single, evidenced next step. Every
returned action has a `reason` built from counted real records; there is no
generic "keep going!" fallback with no evidence behind it. If nothing
actionable is found, the caller should show a neutral empty state instead of
inventing motivational text (see routers/intelligence.py).
"""
from typing import Dict, List, Optional


def compute_next_best_action(
    recommendations: List[Dict],
    saved_count: int,
    applications: List[Dict],
    idea_history_count: int,
    profile_complete: bool = True,
) -> Optional[Dict]:
    candidates = []

    if not profile_complete:
        candidates.append({
            "priority": 95,
            "title": "Your profile needs more signal",
            "detail": "Add skills and interests to unlock accurate recommendations.",
            "action": "Complete profile",
            "link": "/profile",
        })

    closing_soon_high_fit = [
        r for r in recommendations if r.get("fitScore", 0) >= 70 and r.get("urgency") in ("critical", "soon")
    ]
    if closing_soon_high_fit:
        candidates.append({
            "priority": 100,
            "title": f"{len(closing_soon_high_fit)} high-fit opportunit{'y is' if len(closing_soon_high_fit) == 1 else 'ies are'} closing soon",
            "detail": closing_soon_high_fit[0]["title"],
            "action": "Review opportunities",
            "link": "/opportunities",
        })

    stalled_apps = [a for a in applications if a["status"] in ("planning", "applying")]
    if stalled_apps:
        candidates.append({
            "priority": 80,
            "title": f"{len(stalled_apps)} application{'s' if len(stalled_apps) != 1 else ''} still in progress",
            "detail": stalled_apps[0].get("title", "An opportunity"),
            "action": "Continue application",
            "link": "/applications",
        })

    if saved_count > 0 and not applications:
        candidates.append({
            "priority": 60,
            "title": f"You've saved {saved_count} opportunit{'y' if saved_count == 1 else 'ies'} but haven't started tracking any",
            "detail": "Move one into your application pipeline.",
            "action": "Open saved opportunities",
            "link": "/saved",
        })

    if recommendations and idea_history_count == 0:
        candidates.append({
            "priority": 40,
            "title": "You haven't validated an idea yet",
            "detail": "Check originality before you invest real build time.",
            "action": "Check originality",
            "link": "/originality",
        })

    if not candidates and not recommendations:
        candidates.append({
            "priority": 50,
            "title": "No recommendations available right now",
            "detail": "Try adjusting your profile skills or check back once more opportunities are added.",
            "action": "View profile",
            "link": "/profile",
        })

    if not candidates:
        return None
    return max(candidates, key=lambda c: c["priority"])
