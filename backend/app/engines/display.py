"""Display-only helpers for the sentences the engines write. Matching always uses the lowercase keys; these change
only what a person reads (acronym casing, plurals). Kept in sync with frontend/src/lib/format.ts `skillLabel`."""
from __future__ import annotations

ACRONYMS = {
    "nlp": "NLP", "css": "CSS", "sql": "SQL", "iot": "IoT", "devops": "DevOps", "ui/ux": "UI/UX", "ai/ml": "AI/ML", "c++": "C++",
    "javascript": "JavaScript", "typescript": "TypeScript", "api design": "API design", "aws": "AWS", "gcp": "GCP",
}


def label(term: str | None) -> str:
    """'nlp' → 'NLP', 'ai/ml' → 'AI/ML'; everything else is left as written."""
    if not term:
        return ""
    return ACRONYMS.get(term.strip().lower(), term)


def labels(terms) -> str:
    return ", ".join(label(t) for t in terms)


def plural(n: int, word: str) -> str:
    """'1 skill', '2 skills', '3 relevant opportunities' (consonant + y → ies)."""
    if n == 1:
        return f"{n} {word}"
    if word.endswith("y") and len(word) > 1 and word[-2] not in "aeiou":
        return f"{n} {word[:-1]}ies"
    return f"{n} {word}s"
