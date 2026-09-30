from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from ..core.errors import not_found
from ..core.security import CurrentUser, get_db, require_student
from ..db.session import Db
from ..services import catalog, fit as fitsvc, presenters
from ..services.common import like_escape

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("", summary="Organizations with counts derived from real listings (no invented stats)")
def list_orgs(q: Optional[str] = Query(None, max_length=100), page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=100),
              user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    where, p = "true", {}
    if q:
        where = "o.name ilike '%' || :q || '%'"; p["q"] = like_escape(q)
    rows = db.all(f"""select o.slug, o.name, o.website,
                             (select count(*) from public.opportunities x where x.organization_id = o.id and x.status = 'active' and (x.deadline is null or x.deadline >= current_date))::int as open_count,
                             coalesce((select array_agg(distinct x.category order by x.category) from public.opportunities x where x.organization_id = o.id and x.category is not null), '{{}}') as categories,
                             (select bool_and(x.source_type = 'dev_seed') from public.opportunities x where x.organization_id = o.id) as demo
                        from public.organizations o where {where} order by 4 desc, o.name limit :l offset :o""", l=page_size, o=(page - 1) * page_size, **p)
    total = db.val(f"select count(*) from public.organizations o where {where}", **p)
    return {"items": [{"slug": r["slug"], "name": r["name"], "website": r["website"], "openCount": r["open_count"], "categories": r["categories"], "isDemo": bool(r["demo"])} for r in rows],
            "total": total, "page": page, "pageSize": page_size}


@router.get("/{slug}")
def get_org(slug: str, user: CurrentUser = Depends(require_student), db: Db = Depends(get_db)):
    o = db.one("select id::text as id, slug, name, website from public.organizations where slug = :s", s=slug.lower()[:100])
    if not o:
        raise not_found("Organization")
    rows, total = catalog.search(db, {"include_expired": True}, "deadline", 1, 100, limit_all=100)
    rows = [r for r in rows if r["organization_slug"] == o["slug"]]
    s, ctx = fitsvc.load_context(db, user.id)
    fits = fitsvc.fit_for_rows(rows, s, ctx)
    saved, apps = presenters.user_flags(db, user.id, [r["id"] for r in rows])
    cards = [presenters.card(r, fits[r["id"]], r["id"] in saved, apps.get(r["id"])) for r in rows]
    return {"slug": o["slug"], "name": o["name"], "website": o["website"], "isDemo": bool(cards) and all(c["isDemo"] for c in cards),
            "openCount": sum(1 for c in cards if not c["isExpired"]), "opportunities": cards,
            "note": "Only facts stored in NIRMAAN are shown; logos, descriptions and popularity numbers are not available for organizations."}
