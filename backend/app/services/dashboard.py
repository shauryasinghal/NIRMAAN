"""Everything on the dashboard is read from the database at request time; nothing is a constant."""
from __future__ import annotations

import datetime as dt

from ..db.session import Db
from ..engines.next_best_action import next_best_actions
from ..engines.skill_intelligence import compute_skill_gaps
from . import applications as apps_svc, catalog, fit as fitsvc, presenters
from .common import today
from .profiles import get_profile

SKILL_GAP_SCAN = 200


def skill_gaps(db: Db, user_id: str, s, ctx, rows: list[dict], limit: int = 8) -> list[dict]:
    fits = fitsvc.fit_for_rows(rows, s, ctx)
    top = sorted(rows, key=lambda r: -fits[r["id"]].overall)[:SKILL_GAP_SCAN]
    evidence: dict[str, list[dict]] = {}
    for e in db.all("select sk.name as skill, e.source, e.evidence from public.skill_evidence e join public.skills sk on sk.id = e.skill_id where e.profile_id = cast(:u as uuid) order by e.created_at desc", u=user_id):
        evidence.setdefault(e["skill"], []).append({"source": e["source"], "evidence": e["evidence"]})
    return compute_skill_gaps(s, [catalog.to_signals(r) for r in top], ctx, evidence, limit)


def build(db: Db, user_id: str) -> dict:
    profile = get_profile(db, user_id)
    s, ctx = fitsvc.load_context(db, user_id)
    rows, _ = catalog.search(db, {}, "relevance", 1, 50, limit_all=1000)
    fits = fitsvc.fit_for_rows(rows, s, ctx)
    ranked = sorted([r for r in rows if r["id"] not in ctx.affinity.dismissed], key=lambda r: (-fits[r["id"]].overall, r["deadline"] is None, r["deadline"] or dt.date.max, r["title"]))
    saved_ids = {r["id"] for r in db.all("select opportunity_id::text as id from public.saved_opportunities where student_id = cast(:u as uuid)", u=user_id)}
    apps = apps_svc.list_for(db, user_id)
    app_ids = {a["opportunity"]["id"] for a in apps}
    top = ranked[:5]
    saved_, applied_ = presenters.user_flags(db, user_id, [r["id"] for r in top])
    recommendations = [presenters.card(r, fits[r["id"]], r["id"] in saved_, applied_.get(r["id"])) for r in top]

    # deadlines: opportunities the student saved or is applying to, soonest first
    deadline_rows = db.all("""select o.id::text as id, o.title, o.deadline, org.name as organization, (o.source_type = 'dev_seed') as is_demo,
                                     exists (select 1 from public.saved_opportunities s where s.opportunity_id = o.id and s.student_id = cast(:u as uuid)) as saved,
                                     (select a.status::text from public.applications a where a.opportunity_id = o.id and a.student_id = cast(:u as uuid)) as status
                                from public.opportunities o join public.organizations org on org.id = o.organization_id
                               where o.deadline between current_date and current_date + 30 and o.status = 'active'
                                 and (o.id in (select opportunity_id from public.saved_opportunities where student_id = cast(:u as uuid))
                                      or o.id in (select opportunity_id from public.applications where student_id = cast(:u as uuid) and status in ('wishlist','saved','planning','applying')))
                               order by o.deadline, o.title limit 8""", u=user_id)
    deadlines = [{"opportunityId": r["id"], "title": r["title"], "organization": r["organization"], "deadline": r["deadline"], **presenters.urgency_c(r["deadline"]), "status": r["status"], "saved": r["saved"], "isDemo": r["is_demo"]} for r in deadline_rows]

    counts = {r["s"]: r["n"] for r in db.all("select status::text as s, count(*)::int as n from public.applications where student_id = cast(:u as uuid) group by 1", u=user_id)}
    teams = db.all("select t.id::text as id, t.name, t.status, o.title as opp from public.teams t left join public.opportunities o on o.id = t.opportunity_id order by t.created_at desc limit 5")
    ideas = db.all("select id::text as id, title, status::text as status, top_similarity::float as top, created_at from public.ideas where owner_id = cast(:u as uuid) and kind = 'submission' order by created_at desc limit 5", u=user_id)
    gaps = skill_gaps(db, user_id, s, ctx, rows)

    # ── Next Best Action from real state ───────────────────────────────────────────────────────
    ids = [a["opportunity"]["id"] for a in apps] + list(saved_ids)
    team_opps = {r["o"] for r in db.all("select opportunity_id::text as o from public.teams where opportunity_id is not null")}
    idea_opps = {r["o"] for r in db.all("select opportunity_id::text as o from public.ideas where owner_id = cast(:u as uuid) and opportunity_id is not null", u=user_id)}
    meta = {r["id"]: r for r in (catalog.search(db, {"ids": ids, "include_expired": True}, "newest", 1, 300)[0] if ids else [])}
    idle = {r["id"]: r["idle"] for r in db.all("select id::text as id, (extract(epoch from (now() - updated_at))/86400)::int as idle from public.applications where student_id = cast(:u as uuid)", u=user_id)}
    due = {r["id"] for r in db.all("select id::text as id from public.applications where student_id = cast(:u as uuid) and reminder_at <= current_date and status not in ('selected','rejected','withdrawn')", u=user_id)}
    with db.service():
        invites = db.all("""select m.team_id::text as team_id, coalesce(p.full_name, 'A student') as who, o.title as opp from public.team_memberships m join public.teams t on t.id = m.team_id
                              join public.profiles p on p.id = t.owner_id left join public.opportunities o on o.id = t.opportunity_id where m.profile_id = cast(:u as uuid) and m.status = 'invited'""", u=user_id)
        changes = db.all("""select i.id::text as id, i.title, (select d.note from public.review_decisions d join public.reviews r on r.id = d.review_id where r.idea_id = i.id order by d.created_at desc limit 1) as note
                              from public.ideas i where i.owner_id = cast(:u as uuid) and i.status = 'changes_requested'""", u=user_id)
    state = {
        "profile": {"has_skills": bool(profile["skills"]), "has_interests": bool(profile["interests"]), "has_branch": bool(profile["branch"])},
        "applications": [{"id": a["id"], "opportunity_id": a["opportunity"]["id"], "title": a["opportunity"]["title"], "status": a["status"], "days_left": a["opportunity"]["days_remaining"],
                          "idle_days": idle.get(a["id"], 0), "reminder_due": a["id"] in due, "next_action": a["next_action"], "category": a["opportunity"]["category"]} for a in apps],
        "saved": [{"id": i, "title": meta[i]["title"], "participation": meta[i]["participation"], "min_team": meta[i]["min_team_size"], "category": meta[i]["category"],
                   "days_left": presenters.urgency(meta[i]["deadline"])["days_remaining"], "has_team": i in team_opps, "has_idea": i in idea_opps} for i in saved_ids if i in meta],
        "saved_ids": list(saved_ids),
        "recommendations": [{"id": r["id"], "title": r["title"], "fit": fits[r["id"]].overall, "days_left": presenters.urgency(r["deadline"])["days_remaining"]} for r in ranked[:15]],
        "ideas": [{"id": c["id"], "title": c["title"], "status": "changes_requested", "note": c["note"]} for c in changes] + [{"id": i["id"], "title": i["title"], "status": i["status"]} for i in ideas if i["status"] != "changes_requested"],
        "team_invitations": [{"team_id": i["team_id"], "from": i["who"], "opportunity": i["opp"]} for i in invites],
        "skill_gaps": gaps,
    }
    nba = next_best_actions(state, today())

    unread = db.val("select count(*) from public.notifications where student_id = cast(:u as uuid) and read_at is null", u=user_id)
    return {
        "greetingName": (profile["full_name"] or "").split(" ")[0] or None, "profile": {"completeness": profile["completeness"], "onboardingCompleted": profile["onboarding_completed"]},
        "nextBestAction": nba, "recommendations": recommendations,
        "basedOn": {"confirmedSkills": len(profile["skills"]), "interests": len(profile["interests"]), "behaviouralEvents": ctx.affinity.n_events},
        "deadlines": deadlines, "skillGaps": gaps[:5],
        "pipeline": {"counts": {k: counts.get(k, 0) for k in ("wishlist", "saved", "planning", "applying", "applied", "shortlisted", "interview", "selected", "rejected", "withdrawn")}, "total": sum(counts.values())},
        "teams": [{"id": t["id"], "name": t["name"], "status": t["status"], "opportunity": t["opp"]} for t in teams], "pendingInvitations": len(invites),
        "ideas": [{"id": i["id"], "title": i["title"], "status": i["status"], "topSimilarity": i["top"], "createdAt": i["created_at"]} for i in ideas],
        "insights": apps_svc.insights(db, user_id),
        "totals": {"saved": len(saved_ids), "applications": len(apps), "teams": len(teams), "ideas": db.val("select count(*) from public.ideas where owner_id = cast(:u as uuid) and kind = 'submission'", u=user_id),
                   "unreadNotifications": unread, "opportunitiesScored": len(rows), "opportunitiesAbove70": sum(1 for r in rows if fits[r["id"]].overall >= 70)},
    }
