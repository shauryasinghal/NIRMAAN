"""
Skill gap map. Aggregates the `missingSkills` already computed by the real
recommender across a student's actual recommended opportunities - it does
NOT invent a proficiency percentage for skills the student never declared.
Output is a count: "this skill would unlock N opportunities you're
currently missing it for," which is a real, verifiable number from the
current recommendation set.
"""
from collections import Counter
from typing import Dict, List


def compute_skill_gaps(recommendations: List[Dict], top_n: int = 8) -> List[Dict]:
    counter: Counter = Counter()
    example_titles: Dict[str, str] = {}

    for r in recommendations:
        for skill in r.get("missingSkills", []):
            counter[skill] += 1
            example_titles.setdefault(skill, r["title"])

    ranked = counter.most_common(top_n)
    return [
        {"skill": skill, "unlocksCount": count, "example": example_titles[skill]}
        for skill, count in ranked
    ]
