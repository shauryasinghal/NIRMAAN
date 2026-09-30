from __future__ import annotations

import datetime as dt
from typing import Literal, Optional

from pydantic import ConfigDict, Field

from .common import ApiModel

Level = Literal["beginner", "intermediate", "advanced"]


class ProfileUpdate(ApiModel):
    """`extra=forbid`: sending `role`, `id` or `email` is a 422, never silently ignored."""
    model_config = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)
    full_name: Optional[str] = Field(None, max_length=120)
    year: Optional[str] = Field(None, max_length=20)
    branch: Optional[str] = Field(None, max_length=80)
    experience_level: Optional[Level] = None
    availability_hrs: Optional[int] = Field(None, ge=0, le=80)
    open_to_team: Optional[bool] = None
    participation_pref: Optional[Literal["individual", "team", "either"]] = None
    location: Optional[str] = Field(None, max_length=160)
    education_level: Optional[Literal["high_school", "undergraduate", "postgraduate", "phd", "other"]] = None
    preferred_format: Optional[Literal["online", "offline", "hybrid"]] = None
    skills: Optional[list[str]] = Field(None, max_length=60)
    interests: Optional[list[str]] = Field(None, max_length=30)
    onboarding_completed: Optional[bool] = None


class Completeness(ApiModel):
    complete: bool
    missing: list[str]
    optional_missing: list[str]
    percent: int


class ProfileOut(ApiModel):
    id: str
    email: str
    full_name: str
    role: str
    year: Optional[str] = None
    branch: Optional[str] = None
    experience_level: Level
    availability_hrs: int
    open_to_team: bool
    onboarding_completed: bool
    participation_pref: str
    location: Optional[str] = None
    education_level: Optional[str] = None
    preferred_format: Optional[str] = None
    skills: list[str]
    inferred_skills: list[dict]
    interests: list[str]
    skill_evidence: list[dict]
    items: list[dict] = []
    links: dict = {}
    completeness: Completeness
    created_at: dt.datetime
