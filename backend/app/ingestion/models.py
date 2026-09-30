from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Optional

from pydantic import BaseModel, Field, field_validator


@dataclass
class RawRecord:
    """What a source hands to the pipeline: untrusted, source-shaped data."""
    external_id: str
    data: dict
    source_url: str | None = None


class Candidate(BaseModel):
    """A validated, normalised opportunity ready to be stored. Unknown stays None — never a default."""
    external_id: str
    title: str = Field(min_length=3, max_length=200)
    organization: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=5000)
    category: Optional[str] = None
    subcategory: Optional[str] = None
    domain: Optional[str] = None                 # interest slug
    tags: list[str] = []
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    difficulty: Optional[str] = None
    format: Optional[str] = None
    work_mode: Optional[str] = None
    participation: Optional[str] = None
    min_team_size: Optional[int] = None
    max_team_size: Optional[int] = None
    location: Optional[str] = None
    eligibility: Optional[str] = None
    education_requirements: Optional[str] = None
    experience_requirements: Optional[str] = None
    prize_text: Optional[str] = None
    stipend_amount: Optional[float] = None
    stipend_currency: Optional[str] = None
    salary_text: Optional[str] = None
    certificate: Optional[bool] = None
    registration_start: Optional[dt.date] = None
    deadline: Optional[dt.date] = None
    event_start: Optional[dt.date] = None
    event_end: Optional[dt.date] = None
    official_url: Optional[str] = None
    application_url: Optional[str] = None
    canonical_url: Optional[str] = None

    @field_validator("difficulty")
    @classmethod
    def _diff(cls, v):
        if v is not None and v not in ("beginner", "intermediate", "advanced"):
            raise ValueError("difficulty must be beginner/intermediate/advanced")
        return v

    @field_validator("format")
    @classmethod
    def _fmt(cls, v):
        if v is not None and v not in ("online", "offline", "hybrid"):
            raise ValueError("format must be online/offline/hybrid")
        return v

    @field_validator("work_mode")
    @classmethod
    def _wm(cls, v):
        if v is not None and v not in ("remote", "onsite", "hybrid"):
            raise ValueError("work_mode must be remote/onsite/hybrid")
        return v

    @field_validator("participation")
    @classmethod
    def _part(cls, v):
        if v is not None and v not in ("individual", "team"):
            raise ValueError("participation must be individual/team")
        return v


@dataclass
class RunStats:
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    duplicates: int = 0
    rejected: int = 0
    errors: list[str] = field(default_factory=list)
    rejections: list[dict] = field(default_factory=list)
