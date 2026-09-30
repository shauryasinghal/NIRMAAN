"""
Opportunity Recommender — content-based fit ranking.

Pipeline: student profile + opportunity dataset
          -> normalise skills/domain text
          -> TF-IDF vectorise
          -> cosine similarity(student_vector, opportunity_vector)
          -> Top-K ranked list with a plain-language explanation

Chosen over collaborative filtering because NIRMAAN is a new platform with
no interaction history yet (cold-start — see synopsis Section 8.2).
"""
from typing import List, Dict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from ..utils import deadline_urgency


def _profile_text(skills: List[str], interests: List[str]) -> str:
    # Skills weighted more heavily than interests by repetition — a simple,
    # explainable way to bias TF-IDF term weight without a learned model.
    return " ".join(skills * 3 + interests)


def _opportunity_text(opp) -> str:
    return " ".join(list(opp.required_skills) * 3 + [opp.domain])


def recommend(student, opportunities: List, top_k: int = 10) -> List[Dict]:
    if not opportunities:
        return []

    corpus = [_profile_text(student.skills or [], student.interests or [])] + \
             [_opportunity_text(o) for o in opportunities]

    vectorizer = TfidfVectorizer()
    try:
        matrix = vectorizer.fit_transform(corpus)
    except ValueError:
        # Empty vocabulary (e.g. student has no skills yet)
        return []

    student_vec = matrix[0:1]
    opp_matrix = matrix[1:]
    sims = cosine_similarity(student_vec, opp_matrix).flatten()

    student_skills = set(s.lower() for s in (student.skills or []))
    results = []
    for opp, score in zip(opportunities, sims):
        req = set(s.lower() for s in (opp.required_skills or []))
        matched = sorted(student_skills & req)
        missing = sorted(req - student_skills)
        if matched:
            reason = f"Strong overlap on {', '.join(matched[:3])}."
        else:
            reason = "Ranked by overall skill/domain similarity to your profile."
        urgency = deadline_urgency(opp.deadline)
        results.append({
            "id": opp.id,
            "title": opp.title,
            "organization": opp.organization,
            "domain": opp.domain,
            "skills": opp.required_skills,
            "deadline": urgency["deadline"],
            "daysRemaining": urgency["daysRemaining"],
            "urgency": urgency["urgency"],
            "isExpired": urgency["isExpired"],
            "format": opp.format,
            "source": opp.source,
            "externalUrl": opp.external_url,
            "fitScore": round(float(score) * 100, 1),
            "matchedSkills": matched,
            "missingSkills": missing,
            "reason": reason,
        })

    results.sort(key=lambda r: r["fitScore"], reverse=True)
    return results[:top_k]
