"""Smart alerts: user-defined criteria → evaluated against new/updated opportunities → hit + notification.

    new/updated opportunity → evaluator → match (criteria AND min fit) → saved_search_hit → notification

Evaluation is idempotent (a hit row per alert×opportunity; notification dedupe_key) and runs as service_role
on behalf of the alert's owner, using the OWNER's profile for the fit score. Triggered by the scheduler /
cron endpoint / CLI, or manually per alert (POST /api/alerts/{id}/evaluate).
"""
from __future__ import annotations

import datetime as dt

from ..core.logging import get_logger
from ..db.session import Db
from ..engines.recommender import score_fit
from . import catalog, fit as fitsvc
from .notifications import get_preferences, notify

log = get_logger("alerts")
ALERT_SELECT = """select a.id::text as id, a.student_id::text as student_id, a.name, a.query, a.category, a.location, a.work_mode, a.participation::text as participation,
       a.deadline_within_days, a.min_fit::float as min_fit, a.enabled, a.last_evaluated_at, a.created_at,
       lower(i.name) as domain, i.name as domain_label, i.slug as domain_slug, s.name as skill
  from public.saved_searches a left join public.interests i on i.id = a.domain_id left join public.skills s on s.id = a.skill_id"""


def shape(r: dict) -> dict:
    return {"id": r["id"], "name": r["name"], "query": r["query"], "category": r["category"], "domain": r["domain_label"], "skill": r["skill"],
            "location": r["location"], "work_mode": r["work_mode"], "participation": r["participation"], "deadline_within_days": r["deadline_within_days"],
            "min_fit": r["min_fit"], "enabled": r["enabled"], "last_evaluated_at": r["last_evaluated_at"], "created_at": r["created_at"]}


def list_alerts(db: Db, user_id: str) -> list[dict]:
    rows = db.all(ALERT_SELECT + " where a.student_id = cast(:u as uuid) order by a.created_at desc", u=user_id)
    hits = {r["id"]: r["n"] for r in db.all("select saved_search_id::text as id, count(*)::int as n from public.saved_search_hits h join public.saved_searches a on a.id = h.saved_search_id where a.student_id = cast(:u as uuid) group by 1", u=user_id)}
    return [{**shape(r), "hit_count": hits.get(r["id"], 0)} for r in rows]


def get_alert(db: Db, user_id: str, alert_id: str) -> dict | None:
    return db.one(ALERT_SELECT + " where a.id = cast(:i as uuid) and a.student_id = cast(:u as uuid)", i=alert_id, u=user_id)


def _resolve(db: Db, data: dict) -> dict:
    out = dict(data)
    if "domain" in data:
        d = data["domain"]
        out["domain_id"] = db.val("select id::text from public.interests where lower(name) = lower(:d) or slug = lower(:d)", d=d) if d else None
        if d and not out["domain_id"]:
            from ..core.errors import bad_request
            raise bad_request(f"Unknown domain: {d}")
    if "skill" in data:
        sk = data["skill"]
        out["skill_id"] = db.val("select id::text from public.skills where name = lower(:s)", s=sk) if sk else None
        if sk and not out["skill_id"]:
            from ..core.errors import bad_request
            raise bad_request(f"Unknown skill: {sk}")
    return out


def create_alert(db: Db, user_id: str, data: dict) -> str:
    d = _resolve(db, data)
    return db.val("""insert into public.saved_searches (student_id, name, query, domain_id, skill_id, category, location, work_mode, participation, deadline_within_days, min_fit, enabled)
                     values (cast(:u as uuid), :name, coalesce(:query, ''), cast(:domain_id as uuid), cast(:skill_id as uuid), :category, :location, :work_mode,
                             cast(:participation as public.participation_mode), :deadline_within_days, :min_fit, coalesce(:enabled, true)) returning id::text""",
                  u=user_id, name=d["name"], query=d.get("query"), domain_id=d.get("domain_id"), skill_id=d.get("skill_id"), category=d.get("category"),
                  location=d.get("location"), work_mode=d.get("work_mode"), participation=d.get("participation"),
                  deadline_within_days=d.get("deadline_within_days"), min_fit=d.get("min_fit"), enabled=d.get("enabled"))


def update_alert(db: Db, user_id: str, alert_id: str, data: dict) -> bool:
    d = _resolve(db, data)
    cols = {"name": "name", "query": "query", "domain_id": "domain_id", "skill_id": "skill_id", "category": "category", "location": "location",
            "work_mode": "work_mode", "deadline_within_days": "deadline_within_days", "min_fit": "min_fit", "enabled": "enabled"}
    sets, params = [], {}
    for k, col in cols.items():
        if k in d:
            sets.append(f"{col} = " + ("cast(:%s as uuid)" % k if k.endswith("_id") else ":%s" % k)); params[k] = d[k]
    if "participation" in d:
        sets.append("participation = cast(:participation as public.participation_mode)"); params["participation"] = d["participation"]
    if not sets:
        return True
    return db.run(f"update public.saved_searches set {', '.join(sets)}, last_evaluated_at = null where id = cast(:i as uuid) and student_id = cast(:u as uuid)", i=alert_id, u=user_id, **params) > 0


def _criteria(a: dict) -> dict:
    f: dict = {"q": a["query"] or None, "category": [a["category"]] if a["category"] else [], "domain": [a["domain_slug"]] if a["domain_slug"] else [],
               "skills": [a["skill"]] if a["skill"] else [], "location": a["location"], "work_mode": [a["work_mode"]] if a["work_mode"] else [],
               "participation": [a["participation"]] if a["participation"] else [], "deadline_within": a["deadline_within_days"]}
    return f


def evaluate_alert(db: Db, a: dict, *, only_ids: list[str] | None = None, incremental: bool = False, limit: int = 500) -> dict:
    """Runs as service_role for the alert's owner. `incremental` = only opportunities created/updated since the last evaluation."""
    with db.service():
        f = _criteria(a)
        if only_ids is not None:
            f["ids"] = only_ids
        if incremental and a["last_evaluated_at"]:
            f["changed_since_alert"] = a["last_evaluated_at"]
        rows, _ = catalog.search(db, f, "newest", 1, limit, limit_all=limit)
        already = {r["id"] for r in db.all("select opportunity_id::text as id from public.saved_search_hits where saved_search_id = cast(:a as uuid)", a=a["id"])}
        rows = [r for r in rows if r["id"] not in already]
        s, ctx = fitsvc.load_context(db, a["student_id"])
        threshold = a["min_fit"] or 0.0
        matches, notified = [], 0
        for r in rows:
            fit = score_fit(s, catalog.to_signals(r), ctx)
            if fit.overall < threshold:
                continue
            db.run("insert into public.saved_search_hits (saved_search_id, opportunity_id, fit_score) values (cast(:a as uuid), cast(:o as uuid), :f) on conflict do nothing", a=a["id"], o=r["id"], f=fit.overall)
            closes = f" · closes {r['deadline']}" if r["deadline"] else ""
            sent = notify(db, a["student_id"], "smart_alert", f"New match for “{a['name']}”", f"{r['title']} — {fit.overall:.0f}% fit{closes}",
                          f"/opportunities/{r['id']}", f"alert:{a['id']}:{r['id']}")
            notified += int(sent)
            matches.append({"opportunityId": r["id"], "title": r["title"], "organization": r["organization"], "fit": fit.overall, "deadline": r["deadline"]})
        db.run("update public.saved_searches set last_evaluated_at = now() where id = cast(:a as uuid)", a=a["id"])
    log.info("alert evaluated", extra={"event": "alert_evaluated", "count": len(matches)})
    return {"alertId": a["id"], "candidates": len(rows), "matches": matches, "notificationsCreated": notified}


def evaluate_all(db: Db, only_ids: list[str] | None = None) -> dict:
    with db.service():
        alerts = db.all(ALERT_SELECT + " join public.profiles p on p.id = a.student_id where a.enabled order by a.created_at")
    totals = {"alerts": len(alerts), "matches": 0, "notifications": 0}
    for a in alerts:
        res = evaluate_alert(db, a, only_ids=only_ids, incremental=only_ids is None)
        totals["matches"] += len(res["matches"]); totals["notifications"] += res["notificationsCreated"]
    return totals


def notify_high_fit(db: Db, new_ids: list[str], max_students: int = 500) -> dict:
    """For each onboarded student who wants them: new opportunities scoring at/above their threshold."""
    if not new_ids:
        return {"students": 0, "notifications": 0}
    sent = 0
    with db.service():
        students = db.all("""select p.id::text as id from public.profiles p left join public.notification_preferences np on np.student_id = p.id
                              where p.role = 'student' and p.onboarding_completed and coalesce(np.high_fit, true) order by p.created_at limit :n""", n=max_students)
        rows, _ = catalog.search(db, {"ids": new_ids}, "newest", 1, 500, limit_all=500)
        for st in students:
            s, ctx = fitsvc.load_context(db, st["id"])
            thr = get_preferences(db, st["id"])["min_fit_for_notify"]
            for r in rows:
                fit = score_fit(s, catalog.to_signals(r), ctx)
                if fit.overall >= thr:
                    sent += int(notify(db, st["id"], "high_fit_opportunity", f"{fit.overall:.0f}% fit: {r['title']}",
                                       "; ".join(fit.reasons[:2]) or "A new opportunity matches your profile.", f"/opportunities/{r['id']}", f"highfit:{r['id']}"))
    return {"students": len(students), "notifications": sent}
