"""
Resume parsing. Real text extraction (pdfplumber for PDF, python-docx for
DOCX) followed by regex/keyword-based field detection - an honest
"heuristic parser," not an LLM or trained extraction model, and the UI must
say so. Every field is either found in the actual resume text or omitted;
nothing is guessed to fill a gap. The caller must show extracted fields to
the student for confirmation before writing anything to their profile -
see routers/resume.py - this module never touches the database.
"""
import io
import re
from typing import Optional

import pdfplumber
from docx import Document

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
}

# Same controlled vocabulary the frontend's skill picker uses, so extracted
# skills are guaranteed to match something the recommender already understands.
KNOWN_SKILLS = [
    "python", "javascript", "typescript", "react", "machine learning", "deep learning", "nlp", "sql",
    "java", "c++", "c#", "ui/ux", "cloud", "devops", "cybersecurity", "data science",
    "docker", "kubernetes", "api design", "git", "iot", "networking", "figma", "css", "html",
    "node.js", "django", "flask", "fastapi", "aws", "azure", "gcp", "tensorflow", "pytorch",
    "pandas", "numpy", "scikit-learn", "mongodb", "postgresql", "redis", "graphql", "rest api",
]

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_-]+)")
LINKEDIN_RE = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/in/([A-Za-z0-9_-]+)")


class ResumeParseError(Exception):
    pass


def validate_upload(filename: str, content_type: str, size: int) -> None:
    if size > MAX_FILE_SIZE_BYTES:
        raise ResumeParseError("File is too large (5 MB limit).")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ResumeParseError("Only PDF and DOCX resumes are supported.")
    if not filename.lower().endswith((".pdf", ".docx")):
        raise ResumeParseError("File extension must be .pdf or .docx.")


def extract_text(content: bytes, content_type: str) -> str:
    try:
        if content_type == "application/pdf":
            text_parts = []
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    text_parts.append(page.extract_text() or "")
            return "\n".join(text_parts)
        else:
            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
    except Exception as e:
        raise ResumeParseError(f"Could not read this file — it may be corrupted or password-protected ({e.__class__.__name__}).")


def _guess_name(text: str) -> Optional[str]:
    for line in text.strip().splitlines()[:5]:
        line = line.strip()
        if not line or "@" in line or any(ch.isdigit() for ch in line):
            continue
        words = line.split()
        if 2 <= len(words) <= 4 and all(w[:1].isupper() for w in words if w):
            return line
    return None


def parse_resume(text: str) -> dict:
    lower = text.lower()

    found_skills = []
    for skill in KNOWN_SKILLS:
        pattern = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"
        if re.search(pattern, lower):
            found_skills.append(skill)
    found_skills = sorted(set(found_skills))

    email_match = EMAIL_RE.search(text)
    github_match = GITHUB_RE.search(text)
    linkedin_match = LINKEDIN_RE.search(text)

    return {
        "name": _guess_name(text),
        "email": email_match.group(0) if email_match else None,
        "skills": found_skills,
        "github": github_match.group(0) if github_match else None,
        "linkedin": linkedin_match.group(0) if linkedin_match else None,
        "rawTextPreview": text.strip()[:400],
    }
