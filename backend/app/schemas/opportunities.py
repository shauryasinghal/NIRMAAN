from __future__ import annotations

import datetime as dt
from typing import Literal, Optional

from .common import ApiModel


class FitComponent(ApiModel):
    key: str
    label: str
    weight: float
    score: Optional[float]
    detail: str
    known: bool


class FitSummary(ApiModel):
    overall: float
    confidence: Literal["high", "medium", "low"]
    matched_skills: list[str]
    missing_skills: list[str]
    reasons: list[str]
    concerns: list[str]
    expired: bool = False


class FitDetail(FitSummary):
    opportunity_id: str
    components: list[FitComponent]
    preferred_matched: list[str]
    preferred_missing: list[str]


class Blocker(ApiModel):
    kind: str
    severity: Literal["blocker", "warning", "info"]
    title: str
    detail: str
    fix: str
    impact: float


class WhyNot(ApiModel):
    fit_score: float
    blockers: list[Blocker]
    main_blockers: list[str]
    verify: list[str]


class OpportunityCard(ApiModel):
    id: str
    title: str
    organization: str
    organization_slug: str
    category: Optional[str] = None
    subcategory: Optional[str] = None
    domain: Optional[str] = None
    domain_label: Optional[str] = None
    tags: list[str] = []
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    difficulty: Optional[str] = None
    format: Optional[str] = None
    work_mode: Optional[str] = None
    participation: Optional[str] = None
    min_team_size: Optional[int] = None
    max_team_size: Optional[int] = None
    deadline: Optional[dt.date] = None
    days_remaining: Optional[int] = None
    urgency: str
    is_expired: bool
    location: Optional[str] = None
    prize_text: Optional[str] = None
    stipend_amount: Optional[float] = None
    stipend_currency: Optional[str] = None
    salary_text: Optional[str] = None
    certificate: Optional[bool] = None
    source: str
    source_type: str
    is_demo: bool
    verification_status: str
    freshness_status: str
    last_verified_at: Optional[dt.datetime] = None
    official_url: Optional[str] = None
    saved: bool = False
    application_status: Optional[str] = None
    fit: Optional[FitSummary] = None


class OpportunityDetail(OpportunityCard):
    description: str
    eligibility: Optional[str] = None
    education_requirements: Optional[str] = None
    experience_requirements: Optional[str] = None
    registration_start: Optional[dt.date] = None
    event_start: Optional[dt.date] = None
    event_end: Optional[dt.date] = None
    application_url: Optional[str] = None
    last_seen_at: Optional[dt.datetime] = None
    sources: list[dict] = []
    fit_detail: Optional[FitDetail] = None
    why_not: Optional[WhyNot] = None


class EventIn(ApiModel):
    type: Literal["view", "dismiss", "compare"]


class CompareIn(ApiModel):
    ids: list[str]


class OpportunityPage(ApiModel):
    items: list[OpportunityCard]
    total: int
    page: int
    page_size: int
    pages: int
    fit_scan_truncated: bool = False
    applied: dict = {}
    sort: str = "relevance"
    min_fit: Optional[float] = None


class RecommendationsOut(ApiModel):
    items: list[OpportunityCard]
    total: int
    based_on: dict


class Strongest(ApiModel):
    id: str
    title: str
    fit: float
    reason: str


class CompareOut(ApiModel):
    items: list[OpportunityCard]
    strongest: Optional[Strongest] = None
