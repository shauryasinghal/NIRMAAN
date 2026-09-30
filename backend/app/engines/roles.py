"""Skill → team-role vocabulary (documented heuristic, deliberately small and inspectable)."""
from __future__ import annotations

SKILL_ROLE: dict[str, str] = {
    "python": "Backend Engineer", "sql": "Backend Engineer", "api design": "Backend Engineer", "java": "Backend Engineer",
    "system design": "Backend Engineer", "c++": "Backend Engineer",
    "javascript": "Frontend Engineer", "typescript": "Frontend Engineer", "react": "Frontend Engineer", "css": "Frontend Engineer",
    "ui/ux": "Product Designer", "figma": "Product Designer",
    "machine learning": "ML Engineer", "deep learning": "ML Engineer", "nlp": "ML Engineer",
    "data science": "Data Analyst",
    "cloud": "DevOps / Cloud Engineer", "devops": "DevOps / Cloud Engineer", "docker": "DevOps / Cloud Engineer",
    "cybersecurity": "Security Engineer", "networking": "Security Engineer",
    "iot": "IoT / Embedded Engineer",
    "git": "Generalist",
}
# Skills that don't define a role on their own (so they never decide a person's role).
WEAK_ROLE_SKILLS = {"git", "python", "sql"}


def role_for_skills(skills: list[str] | set[str], prefer: set[str] | None = None) -> str:
    """Role that covers the most of `skills`; ties are broken alphabetically for determinism."""
    votes: dict[str, float] = {}
    for s in skills:
        role = SKILL_ROLE.get(s)
        if not role:
            continue
        votes[role] = votes.get(role, 0.0) + (0.4 if s in WEAK_ROLE_SKILLS else 1.0) + (0.25 if prefer and s in prefer else 0.0)
    if not votes:
        return "Generalist"
    return sorted(votes.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def role_for_skill(skill: str) -> str:
    return SKILL_ROLE.get(skill, "Generalist")
