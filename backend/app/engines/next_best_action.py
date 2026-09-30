"""Next Best Action: one evidenced step, chosen from the student's real state.

Every candidate is generated from counted records (an application row, a saved opportunity, a pending
invitation …) and carries the evidence that triggered it. If nothing applies the engine says so plainly.
Priority = base rank of the situation + a bonus for imminent deadlines. Ties break on title → deterministic.
"""
from __future__ import annotations

import datetime as dt

EARLY = {"wishlist", "saved", "planning", "applying"}


def _plural(n: int, w: str) -> str:
    return f"{n} {w}{'' if n == 1 else 's'}"


def _urgency(days: int | None) -> float:
    return 0.0 if days is None or days < 0 else max(0.0, 10 - days)  # up to +10 in the final days


def next_best_actions(state: dict, today: dt.date) -> dict:
    c: list[dict] = []

    def add(kind, base, title, reason, label, href, evidence, days=None):
        c.append({"kind": kind, "priority": round(base + _urgency(days), 1), "title": title, "reason": reason,
                  "cta": {"label": label, "href": href}, "evidence": evidence})

    for app in state.get("applications", []):
        days = app.get("days_left")
        if app["status"] in EARLY and days is not None and 0 <= days <= 3:
            add("finish_application", 100, f"Finish your application: {app['title']}",
                f"It closes in {_plural(days, 'day')} and it's still marked '{app['status']}'.", "Open application", "/applications",
                {"applicationId": app["id"], "status": app["status"], "daysLeft": days}, days)
        elif app["status"] in EARLY and app.get("idle_days", 0) >= 5:
            add("update_application", 65, f"Update your status for {app['title']}",
                f"No change for {_plural(app['idle_days'], 'day')} while still '{app['status']}'.", "Open application", "/applications",
                {"applicationId": app["id"], "idleDays": app["idle_days"]}, days)
        if app.get("reminder_due"):
            add("application_reminder", 92, f"Reminder due: {app['title']}", app.get("next_action") or "You set a reminder for this application.",
                "Open application", "/applications", {"applicationId": app["id"]})

    for inv in state.get("team_invitations", []):
        add("respond_team_invite", 95, "Respond to a team invitation", f"{inv['from']} invited you to a team" + (f" for {inv['opportunity']}" if inv.get("opportunity") else "") + ".",
            "View invitation", "/team-builder", {"teamId": inv["team_id"]})

    for idea in state.get("ideas", []):
        if idea["status"] == "changes_requested":
            add("revise_idea", 90, f"Revise your idea: {idea['title']}", "A reviewer requested changes" + (f": “{idea['note'][:120]}”" if idea.get("note") else "."),
                "View feedback", "/originality/history", {"ideaId": idea["id"]})

    p = state.get("profile", {})
    missing = [m for m, ok in (("skills", p.get("has_skills")), ("interests", p.get("has_interests")), ("branch", p.get("has_branch"))) if not ok]
    if missing:
        add("complete_profile", 85, "Complete your profile",
            f"Recommendations need your {', '.join(missing)}; without them fit scores are mostly unknown.", "Finish profile", "/profile", {"missing": missing})

    saved_or_applied = {a["opportunity_id"] for a in state.get("applications", [])} | set(state.get("saved_ids", []))
    for rec in state.get("recommendations", []):
        days = rec.get("days_left")
        if rec["fit"] >= 75 and days is not None and 0 <= days <= 10 and rec["id"] not in {a["opportunity_id"] for a in state.get("applications", [])}:
            add("review_high_fit", 80, f"Review {rec['title']}", f"{rec['fit']:.0f}% fit and it closes in {_plural(days, 'day')}.",
                "Open opportunity", f"/opportunities/{rec['id']}", {"opportunityId": rec["id"], "fit": rec["fit"], "daysLeft": days}, days)

    for sv in state.get("saved", []):
        if sv.get("participation") == "team" and (sv.get("min_team") or 1) > 1 and not sv.get("has_team") and sv["id"] not in {a["opportunity_id"] for a in state.get("applications", []) if a["status"] in ("applied", "shortlisted", "interview", "selected")}:
            add("form_team", 70, f"Build a team for {sv['title']}", f"It needs {sv['min_team']}+ people and you haven't formed a team for it.",
                "Build team", f"/team-builder?opportunity={sv['id']}", {"opportunityId": sv["id"], "minTeam": sv["min_team"]}, sv.get("days_left"))
        if not any(a["opportunity_id"] == sv["id"] for a in state.get("applications", [])):
            add("start_application", 60, f"Start tracking {sv['title']}", "You saved it but haven't started an application.",
                "Track application", f"/opportunities/{sv['id']}", {"opportunityId": sv["id"]}, sv.get("days_left"))

    for sv in state.get("saved", []) + [{"id": a["opportunity_id"], "title": a["title"], "category": a.get("category"), "days_left": a.get("days_left")} for a in state.get("applications", []) if a["status"] in EARLY]:
        if sv.get("category") in ("Hackathon", "Ideathon") and not state.get("ideas") and not sv.get("has_idea"):
            add("validate_idea", 55, f"Validate your idea for {sv['title']}", "No idea checked yet for a category that rewards original ideas.",
                "Check originality", f"/originality?opportunity={sv['id']}", {"opportunityId": sv["id"]}, sv.get("days_left"))
            break

    for gap in state.get("skill_gaps", [])[:1]:
        if gap["unlocks"] >= 2:
            add("close_skill_gap", 50, f"Close a skill gap: {gap['skill']}", f"{gap['skill']} is missing from {_plural(gap['unlocks'], 'relevant opportunity')}"
                + (f"; adding it lifts {gap['highFitUnlocks']} to 75%+ fit." if gap["highFitUnlocks"] else "."), "See skill gaps", "/dashboard#skills",
                {"skill": gap["skill"], "unlocks": gap["unlocks"], "highFitUnlocks": gap["highFitUnlocks"]})

    if not saved_or_applied:
        n = sum(1 for r in state.get("recommendations", []) if r["fit"] >= 60)
        if n:
            add("discover", 30, "Explore your matches", f"{_plural(n, 'opportunity')} match you at 60% or better and you haven't saved any yet.", "Browse matches", "/opportunities?sort=fit", {"count": n})

    if not c:
        return {"action": None, "alternatives": [], "message": "Nothing needs your attention right now."}
    c.sort(key=lambda a: (-a["priority"], a["title"]))
    return {"action": c[0], "alternatives": c[1:4], "message": None}
