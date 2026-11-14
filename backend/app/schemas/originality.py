"""Originality checker contracts.

  * `OriginalityCheckIn` — the request body of POST /api/originality/check. `title` and `description` are the long-standing fields; the
    structured sections (problem statement, objectives, proposed solution, technologies, additional context) are optional and additive, so
    every existing client keeps working unchanged.
  * `GeminiReportWire` — the JSON the Gemini deep-analysis stage must produce. It is handed to the SDK as the response schema, so the model
    is constrained to this shape, and it is validated again on the way back. It carries NO length limits on purpose (schema constraints the
    API does not support would be dropped silently); `normalise_report` applies the caps afterwards.
  * `AIReport` — what the API returns to the browser (camelCase), after normalisation: every string cleaned and capped, every list capped,
    every match reference resolved to a real matched idea.

Nothing here computes a score. Gemini's levels (low / moderate / high) are qualitative judgements and are returned as words, never as
percentages, so they cannot be confused with the measured embedding similarity shown next to them.
"""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..engines.originality import word_count
from .common import ApiModel

# ── Stage 1: input ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
MAX_SECTION = {"problem_statement": 1500, "objectives": 1500, "proposed_solution": 2500, "technologies": 400, "additional_context": 1500}
SECTION_LABELS = {"problem_statement": "Problem statement", "objectives": "Objectives", "proposed_solution": "Proposed solution",
                  "technologies": "Technologies used", "additional_context": "Additional context"}
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_STRICT = ConfigDict(extra="forbid", alias_generator=ApiModel.model_config["alias_generator"], populate_by_name=True)


class OriginalityCheckIn(ApiModel):
    model_config = _STRICT
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=20, max_length=5000)
    domain: Optional[str] = Field(None, max_length=80)
    opportunity_id: Optional[str] = None
    # optional structured sections (Stage 1). Compared semantically together with the description and shown to the Gemini stage.
    problem_statement: Optional[str] = Field(None, max_length=MAX_SECTION["problem_statement"])
    objectives: Optional[str] = Field(None, max_length=MAX_SECTION["objectives"])
    proposed_solution: Optional[str] = Field(None, max_length=MAX_SECTION["proposed_solution"])
    technologies: Optional[str] = Field(None, max_length=MAX_SECTION["technologies"])
    additional_context: Optional[str] = Field(None, max_length=MAX_SECTION["additional_context"])

    @field_validator("title", "description", "domain", "problem_statement", "objectives", "proposed_solution", "technologies", "additional_context", mode="before")
    @classmethod
    def _clean(cls, v, info):
        """Trim and drop control characters (NUL would make Postgres reject the row) BEFORE the length rules run, so whitespace-only text is rejected.
        Optional fields that end up empty become None (absent), never an empty string."""
        if not isinstance(v, str):
            return v
        v = _CONTROL.sub("", v).strip()
        if v:
            return v
        return "" if info.field_name in ("title", "description") else None

    @field_validator("title", "description")
    @classmethod
    def _has_words(cls, v: str, info):
        need = 1 if info.field_name == "title" else 3
        if word_count(v) < need:     # Unicode-aware: a Chinese or Japanese sentence is many tokens, emoji/zero-width/punctuation-only text is none
            raise ValueError("Please describe the idea in words." if need > 1 else "The title needs at least one letter or digit.")
        return v

    def sections(self) -> dict[str, str]:
        """The structured sections that were actually provided, keyed by snake_case field name, in a fixed order."""
        return {k: v for k in MAX_SECTION if (v := getattr(self, k))}


def compose_comparison_text(description: str, sections: dict[str, str] | None) -> str:
    """The text that is embedded and compared: the description, then each provided section under a plain label. The meaning of the student's
    text is not changed — nothing is paraphrased, reordered within a field or removed."""
    parts = [description.strip()]
    for key, text in (sections or {}).items():
        if text and text.strip():
            parts.append(f"{SECTION_LABELS.get(key, key)}: {text.strip()}")
    return "\n\n".join(parts)


# ── Stage 3: what Gemini must return (schema handed to the SDK) ─────────────────────────────────────────────────────────────────────────
Level = Literal["low", "moderate", "high"]
Relationship = Literal["similar_problem_different_solution", "similar_solution_different_implementation",
                       "similar_functionality_and_approach", "potentially_substantial_overlap", "largely_unrelated"]
Confidence = Literal["low", "medium", "high"]
SuggestionKind = Literal["new_feature", "technical_approach", "target_users", "implementation", "use_case", "problem_approach"]


class DimensionWire(BaseModel):
    level: Level = Field(description="How similar the two ideas are on this dimension, judged from the texts alone.")
    explanation: str = Field(description="One or two plain sentences a student can understand, citing what the texts actually say.")


class MatchAssessmentWire(BaseModel):
    match_id: str = Field(description="The id of the existing idea being compared (exactly as given, e.g. m1).")
    relationship: Relationship = Field(description="The single best description of how the submitted idea relates to this existing idea.")
    problem_similarity: DimensionWire
    solution_similarity: DimensionWire
    functional_similarity: DimensionWire
    target_user_similarity: DimensionWire
    technical_approach_similarity: DimensionWire
    common_features: list[str] = Field(description="Features or capabilities both ideas describe. Empty if none.")
    unique_to_submission: list[str] = Field(description="Features the submitted idea describes that this existing idea does not. Empty if none.")
    meaningful_differences: list[str] = Field(description="Differences that matter for originality (not wording). Empty if none.")
    potentially_reused_concepts: list[str] = Field(description="Concepts that may have been taken from the existing idea. Only when the texts support it. Empty if none.")
    summary: str = Field(description="Two or three sentences summarising the comparison in plain language.")


class SuggestionWire(BaseModel):
    kind: SuggestionKind
    suggestion: str = Field(description="A concrete, practical change the student could make to their idea.")
    rationale: str = Field(description="Why it would make the idea more distinctive, referring to the existing ideas where relevant.")


class GeminiReportWire(BaseModel):
    overall_summary: str = Field(description="Three to five sentences for the student: what overlaps, what is distinctive, what the comparison does and does not show.")
    matches: list[MatchAssessmentWire] = Field(description="One assessment per existing idea provided, in the order given.")
    unique_contributions: list[str] = Field(description="What the submitted idea contributes that none of the existing ideas describe.")
    potential_overlap_areas: list[str] = Field(description="Areas where the submitted idea may substantially overlap with existing ideas.")
    missing_differentiators: list[str] = Field(description="Things a reader would expect the submission to specify, to tell it apart from the existing ideas, but which it does not.")
    suggestions: list[SuggestionWire] = Field(description="Practical ways to make the idea more distinctive, relevant to this idea only.")
    confidence: Confidence = Field(description="How confident this qualitative assessment is, given the length and clarity of the texts.")
    limitations: list[str] = Field(description="What this analysis could not determine (e.g. only short descriptions were available; no code or implementation was seen).")


# ── Stage 4: what the API returns (normalised, camelCase) ────────────────────────────────────────────────────────────────────────────────
class Dimension(ApiModel):
    level: Level
    explanation: str


class MatchAssessment(ApiModel):
    id: str                       # the matched idea's id (resolved from match_id)
    title: str
    similarity: float             # measured embedding similarity, % (copied from the stored match — never from Gemini)
    relationship: Relationship
    relationship_label: str
    problem_similarity: Dimension
    solution_similarity: Dimension
    functional_similarity: Dimension
    target_user_similarity: Dimension
    technical_approach_similarity: Dimension
    common_features: list[str]
    unique_to_submission: list[str]
    meaningful_differences: list[str]
    potentially_reused_concepts: list[str]
    summary: str


class Suggestion(ApiModel):
    kind: SuggestionKind
    suggestion: str
    rationale: str


class AIReport(ApiModel):
    overall_summary: str
    matches: list[MatchAssessment]
    unique_contributions: list[str]
    potential_overlap_areas: list[str]
    missing_differentiators: list[str]
    suggestions: list[Suggestion]
    confidence: Confidence
    limitations: list[str]
    matches_not_assessed: list[str] = []   # ids of matches Gemini did not return an assessment for (shown as such, never filled in)


RELATIONSHIP_LABELS: dict[str, str] = {
    "similar_problem_different_solution": "Similar problem, different solution",
    "similar_solution_different_implementation": "Similar solution, different implementation",
    "similar_functionality_and_approach": "Similar functionality and approach",
    "potentially_substantial_overlap": "Potentially substantial overlap",
    "largely_unrelated": "Largely unrelated",
}

# Caps applied to Gemini's output. Anything longer is cut, never rejected: a verbose answer is still a valid answer.
MAX_TEXT, MAX_SUMMARY, MAX_ITEMS, MAX_SUGGESTIONS = 600, 1500, 8, 6
_CLEAN_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def clean_text(value, limit: int = MAX_TEXT) -> str:
    """Model output → one block of plain text: control characters removed, whitespace collapsed, length capped. The browser renders it as text."""
    text = " ".join(_CLEAN_CTRL.sub(" ", str(value if value is not None else "")).split())
    return text[:limit].rstrip()


def clean_list(values, limit: int = MAX_ITEMS) -> list[str]:
    out: list[str] = []
    for v in values or []:
        t = clean_text(v)
        if t and t not in out:
            out.append(t)
        if len(out) >= limit:
            break
    return out


def normalise_report(wire: GeminiReportWire, matches: list[dict]) -> AIReport:
    """Wire report → API report. `matches` are the stored matches that were sent, each {"key": "m1", "id": <idea id>, "title", "similarity"}.
    A match assessment is kept only if its match_id names one of them (first assessment per match wins); matches the model skipped are listed
    in `matches_not_assessed` so the UI can say so instead of showing nothing."""
    by_key = {m["key"]: m for m in matches}
    seen: set[str] = set()
    out: list[MatchAssessment] = []
    for a in wire.matches:
        m = by_key.get(clean_text(a.match_id, 32))
        if m is None or m["key"] in seen:
            continue
        seen.add(m["key"])
        dim = lambda d: Dimension(level=d.level, explanation=clean_text(d.explanation))
        out.append(MatchAssessment(
            id=m["id"], title=m["title"], similarity=m["similarity"], relationship=a.relationship, relationship_label=RELATIONSHIP_LABELS[a.relationship],
            problem_similarity=dim(a.problem_similarity), solution_similarity=dim(a.solution_similarity), functional_similarity=dim(a.functional_similarity),
            target_user_similarity=dim(a.target_user_similarity), technical_approach_similarity=dim(a.technical_approach_similarity),
            common_features=clean_list(a.common_features), unique_to_submission=clean_list(a.unique_to_submission),
            meaningful_differences=clean_list(a.meaningful_differences), potentially_reused_concepts=clean_list(a.potentially_reused_concepts),
            summary=clean_text(a.summary, MAX_SUMMARY)))
    return AIReport(
        overall_summary=clean_text(wire.overall_summary, MAX_SUMMARY), matches=out,
        unique_contributions=clean_list(wire.unique_contributions), potential_overlap_areas=clean_list(wire.potential_overlap_areas),
        missing_differentiators=clean_list(wire.missing_differentiators),
        suggestions=[Suggestion(kind=s.kind, suggestion=clean_text(s.suggestion), rationale=clean_text(s.rationale)) for s in wire.suggestions[:MAX_SUGGESTIONS] if clean_text(s.suggestion)],
        confidence=wire.confidence, limitations=clean_list(wire.limitations),
        matches_not_assessed=[m["id"] for m in matches if m["key"] not in seen])
