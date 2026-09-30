"""
Organizations. There is no separate Organization content-management model yet
- organization "pages" are derived live from the Opportunity table's
`organization` field. This means only real, currently-known fields are shown
(name, active opportunity count, opportunity list). No logos, descriptions,
verification state, or founded-statistics exist as data, so none are
fabricated here - the frontend should render "Not provided" or hide those
fields rather than inventing them.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models
from ..database import get_db
from ..utils import deadline_urgency

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("")
def list_organizations(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Opportunity.organization, func.count(models.Opportunity.id))
        .group_by(models.Opportunity.organization)
        .order_by(func.count(models.Opportunity.id).desc())
        .all()
    )
    return {"items": [{"name": name, "opportunityCount": count} for name, count in rows]}


@router.get("/{organization_name}")
def get_organization(organization_name: str, db: Session = Depends(get_db)):
    opps = db.query(models.Opportunity).filter(models.Opportunity.organization == organization_name).all()
    if not opps:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Organization not found"})
    domains = sorted(set(o.domain for o in opps))
    return {
        "name": organization_name,
        "opportunityCount": len(opps),
        "domains": domains,
        "opportunities": [
            {
                "id": o.id, "title": o.title, "domain": o.domain, "skills": o.required_skills,
                "category": o.category, "format": o.format, **deadline_urgency(o.deadline),
            }
            for o in opps
        ],
    }
