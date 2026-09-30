"""Plain data carriers shared by the engines. No DB, no HTTP, no globals — so every score is a pure,
reproducible function of its inputs."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

LEVELS = {"beginner": 0, "intermediate": 1, "advanced": 2}


@dataclass(frozen=True)
class StudentSignals:
    id: str
    skills: frozenset[str] = frozenset()              # CONFIRMED skills only (lowercase names)
    inferred_skills: frozenset[str] = frozenset()     # system-suggested, not yet confirmed
    interests: frozenset[str] = frozenset()           # lowercase interest names, e.g. "ai/ml"
    level: str = "beginner"
    availability_hrs: int = 5
    participation_pref: str = "either"
    preferred_format: str | None = None
    location: str | None = None
    education_level: str | None = None
    open_to_team: bool = False


@dataclass(frozen=True)
class OppSignals:
    id: str
    title: str = ""
    organization: str = ""
    domain: str | None = None                          # lowercase interest name
    category: str | None = None
    tags: tuple[str, ...] = ()
    required: frozenset[str] = frozenset()
    preferred: frozenset[str] = frozenset()
    difficulty: str = "intermediate"
    format: str | None = None
    work_mode: str | None = None
    participation: str | None = None
    min_team: int | None = None
    max_team: int | None = None
    deadline: dt.date | None = None
    location: str | None = None
    education_requirements: str | None = None
    eligibility: str | None = None
    is_demo: bool = False


@dataclass
class Affinity:
    """Time-decayed engagement distributions built from the student's own user_events."""
    n_events: int = 0
    category: dict[str, float] = field(default_factory=dict)
    domain: dict[str, float] = field(default_factory=dict)
    skill: dict[str, float] = field(default_factory=dict)
    dismissed: frozenset[str] = frozenset()


@dataclass
class FitContext:
    today: dt.date
    domain_profiles: dict[str, dict[str, float]] = field(default_factory=dict)   # domain -> skill -> weight
    affinity: Affinity = field(default_factory=Affinity)


@dataclass
class Component:
    key: str
    label: str
    weight: float
    score: float | None          # 0..1, or None when the input is unknown (excluded, never guessed)
    detail: str

    def as_dict(self) -> dict:
        return {"key": self.key, "label": self.label, "weight": self.weight,
                "score": None if self.score is None else round(self.score, 3), "detail": self.detail,
                "known": self.score is not None}


@dataclass
class FitResult:
    opportunity_id: str
    overall: float                               # 0..100
    components: list[Component]
    matched_skills: list[str]
    missing_skills: list[str]
    preferred_matched: list[str]
    preferred_missing: list[str]
    reasons: list[str]
    concerns: list[str]
    confidence: str                              # high | medium | low — how much of the score is based on known inputs
    expired: bool = False

    def as_dict(self) -> dict:
        return {
            "opportunityId": self.opportunity_id, "overall": self.overall,
            "components": [c.as_dict() for c in self.components],
            "matchedSkills": self.matched_skills, "missingSkills": self.missing_skills,
            "preferredMatched": self.preferred_matched, "preferredMissing": self.preferred_missing,
            "reasons": self.reasons, "concerns": self.concerns, "confidence": self.confidence, "expired": self.expired,
        }
