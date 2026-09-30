from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response

from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..schemas.common import ApiModel
from ..services import fit as fitsvc

router = APIRouter(prefix="/api/activity", tags=["activity"])


class ActivityOut(ApiModel):
    id: str
    kind: str
    title: str
    link: Optional[str] = None
    created_at: dt.datetime


class ActivityPage(ApiModel):
    items: list[ActivityOut]
    total: int
    page: int
    page_size: int


@router.get("", response_model=ActivityPage)
def list_activity(page: int = Query(1, ge=1, le=1000), page_size: int = Query(30, ge=1, le=100), user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    rows = db.all("select id::text as id, kind, title, link, created_at from public.activities where student_id = cast(:u as uuid) order by created_at desc limit :l offset :o", u=user.id, l=page_size, o=(page - 1) * page_size)
    return {"items": rows, "total": db.val("select count(*) from public.activities where student_id = cast(:u as uuid)", u=user.id), "page": page, "page_size": page_size}


@router.get("/signals", summary="What shapes your recommendations (transparent personalisation)")
def signals(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    counts = db.all("select event_type, count(*)::int as n from public.user_events where student_id = cast(:u as uuid) group by 1 order by 2 desc", u=user.id)
    aff = fitsvc.load_affinity(db, user.id)
    top = lambda d: [{"name": k, "weight": round(v, 2)} for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:5]]
    from ..engines.recommender import MIN_EVENTS_FOR_AFFINITY
    return {"eventCounts": counts, "totalEvents": sum(c["n"] for c in counts), "usedForRanking": aff.n_events, "active": aff.n_events >= MIN_EVENTS_FOR_AFFINITY,
            "minEvents": MIN_EVENTS_FOR_AFFINITY, "topCategories": top(aff.category), "topDomains": top(aff.domain), "topSkills": top(aff.skill),
            "dismissed": len(aff.dismissed), "halfLifeDays": 21,
            "explanation": "Saves, applications, comparisons and views nudge similar opportunities up (recent actions count more; the weight halves every 21 days). "
                           "Dismissed opportunities are hidden. Behaviour accounts for 13% of a fit score and only switches on after 5 actions."}


@router.delete("/signals", status_code=204, summary="Forget my behavioural signals (reset personalisation)")
def reset_signals(user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    db.run("delete from public.user_events where student_id = cast(:u as uuid)", u=user.id)
    return Response(status_code=204)
