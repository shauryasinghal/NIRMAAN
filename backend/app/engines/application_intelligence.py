"""
Application intelligence. Flags applications that are genuinely stalled
(no status change for a while, still sitting in an early pipeline stage) or
genuinely urgent (linked opportunity closing soon) - computed from the
application's own real `updated_at` timestamp and the linked opportunity's
real deadline. No invented "engagement score."
"""
import datetime as dt
from typing import Dict, List

STALLED_STATUSES = {"wishlist", "saved", "planning", "applying"}
STALLED_AFTER_DAYS = 5


def compute_application_insights(applications: List[Dict]) -> List[Dict]:
    insights = []
    now = dt.datetime.now(dt.timezone.utc)

    for a in applications:
        if a["status"] not in STALLED_STATUSES:
            continue
        updated = dt.datetime.fromisoformat(a["updatedAt"])
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=dt.timezone.utc)
        days_idle = (now - updated).days

        if days_idle >= STALLED_AFTER_DAYS:
            insights.append({
                "applicationId": a["id"], "title": a.get("title"), "kind": "stalled",
                "detail": f"Still marked '{a['status']}' after {days_idle} days with no update.",
            })
        if a.get("urgency") in ("critical", "soon"):
            insights.append({
                "applicationId": a["id"], "title": a.get("title"), "kind": "urgent",
                "detail": f"Linked opportunity deadline is {a.get('urgency')} and this application isn't submitted yet.",
            })

    return insights
