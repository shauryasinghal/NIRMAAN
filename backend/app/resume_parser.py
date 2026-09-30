"""Resume handling: hardened upload validation + honest heuristic extraction.

Extraction is rule-based (section headings, regexes, the controlled skill vocabulary) — not an LLM — and the API says
so. Every field is either found in the text or omitted. The caller shows the result for confirmation; this module
never touches the database and never executes or stores the uploaded file (it lives in memory only).

Upload defences: size cap enforced while reading, extension + declared MIME + magic bytes must all agree, DOCX zip
sanity (entry count, expanded size, compression ratio, path traversal, macros), PDF page cap, parse wall-clock timeout.
"""
from __future__ import annotations

import io
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 15
MAX_ZIP_ENTRIES = 200
MAX_EXPANDED_BYTES = 25 * 1024 * 1024
MAX_RATIO = 100
PARSE_TIMEOUT_S = 15
PDF, DOCX = "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

SKILL_ALIASES = {"ml": "machine learning", "reactjs": "react", "react.js": "react", "js": "javascript", "py": "python", "postgres": "sql", "postgresql": "sql", "mysql": "sql",
                 "k8s": "devops", "ci/cd": "devops", "aws": "cloud", "gcp": "cloud", "azure": "cloud", "ux": "ui/ux", "rest api": "api design", "rest": "api design",
                 "restful": "api design", "infosec": "cybersecurity", "scikit-learn": "machine learning", "tensorflow": "deep learning", "pytorch": "deep learning", "keras": "deep learning",
                 "pandas": "data science", "numpy": "data science", "fastapi": "api design", "flask": "api design", "django": "api design", "node.js": "javascript", "html": "css", "tailwind": "css"}

SECTION_PATTERNS = {
    "education": r"education|academics?|academic (background|qualifications?)|qualifications?",
    "projects": r"projects?|personal projects?|academic projects?|selected projects?",
    "experience": r"(work |professional )?experience|internships?|employment|work history",
    "certifications": r"certifications?|certificates?|courses?|licenses?",
    "achievements": r"achievements?|awards?|honou?rs|accomplishments?|extra[- ]?curriculars?",
    "skills": r"(technical |key )?skills|technologies|tech stack",
}
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
URL_RE = re.compile(r"(?:https?://)?(?:www\.)?((?:github\.com|linkedin\.com/in|gitlab\.com|kaggle\.com|medium\.com|behance\.net|dribbble\.com)/[A-Za-z0-9_.\-/]+)", re.I)
BULLET = re.compile(r"^\s*[•●▪◦\-–*·]+\s*")


class ResumeError(Exception):
    """User-facing: the message is safe to show."""


ResumeParseError = ResumeError


def validate_upload(filename: str, content_type: str, data: bytes) -> str:
    """Returns the detected kind ('pdf' | 'docx') or raises ResumeError."""
    if not data:
        raise ResumeError("The file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise ResumeError("File is too large (5 MB limit).")
    ext = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else ""
    if ext not in ("pdf", "docx"):
        raise ResumeError("Only .pdf and .docx resumes are supported.")
    kind_by_mime = {PDF: "pdf", DOCX: "docx"}
    if kind_by_mime.get((content_type or "").split(";")[0].strip().lower()) != ext:
        raise ResumeError("The file type does not match its extension.")
    if ext == "pdf":
        if not data.lstrip()[:5] == b"%PDF-":
            raise ResumeError("This file is not a valid PDF.")
        return "pdf"
    if data[:4] != b"PK\x03\x04":
        raise ResumeError("This file is not a valid DOCX document.")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        infos = z.infolist()
    except zipfile.BadZipFile:
        raise ResumeError("This file is not a valid DOCX document.")
    if len(infos) > MAX_ZIP_ENTRIES:
        raise ResumeError("This document has an unusual structure and can't be read safely.")
    total = 0
    for i in infos:
        total += i.file_size
        if i.filename.startswith(("/", "..")) or ".." in i.filename.split("/") or "\\" in i.filename:
            raise ResumeError("This document has an unsafe internal structure.")
        if i.compress_size and i.file_size / i.compress_size > MAX_RATIO and i.file_size > 1_000_000:
            raise ResumeError("This document is compressed suspiciously and was rejected.")
        if i.filename.lower().endswith(("vbaproject.bin", ".exe", ".dll", ".js", ".vbs")):
            raise ResumeError("Documents containing macros or executables are not accepted.")
    if total > MAX_EXPANDED_BYTES:
        raise ResumeError("This document expands to an unsafe size and was rejected.")
    names = {i.filename for i in infos}
    if "word/document.xml" not in names or "[Content_Types].xml" not in names:
        raise ResumeError("This file is not a valid DOCX document.")
    return "docx"


def _extract_text(data: bytes, kind: str) -> str:
    try:
        if kind == "pdf":
            import pdfplumber
            parts = []
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                if len(pdf.pages) > MAX_PDF_PAGES:
                    raise ResumeError(f"Resumes longer than {MAX_PDF_PAGES} pages are not supported.")
                for page in pdf.pages:
                    parts.append(page.extract_text() or "")
            return "\n".join(parts)
        from docx import Document
        doc = Document(io.BytesIO(data))
        lines = [p.text for p in doc.paragraphs]
        for t in doc.tables:
            for row in t.rows:
                lines.append(" | ".join(c.text.strip() for c in row.cells))
        return "\n".join(lines)
    except ResumeError:
        raise
    except Exception as exc:
        raise ResumeError(f"Could not read this file — it may be corrupted or password-protected ({type(exc).__name__}).")


def extract_text(data: bytes, kind: str) -> str:
    """Wall-clock bounded (a runaway parser cannot hold a request open)."""
    with ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_extract_text, data, kind)
        try:
            return fut.result(timeout=PARSE_TIMEOUT_S)
        except FutureTimeout:
            raise ResumeError("This file took too long to read and was rejected.")


def _clean(line: str) -> str:
    return re.sub(r"\s+", " ", BULLET.sub("", line)).strip()[:200]


def _section_of(line: str) -> str | None:
    s = line.strip().rstrip(":").strip()
    if not s or len(s) > 40 or len(s.split()) > 4:
        return None
    for name, pat in SECTION_PATTERNS.items():
        if re.fullmatch(pat, s, re.I):
            return name
    return None


def _guess_name(lines: list[str]) -> str | None:
    for line in lines[:6]:
        s = line.strip()
        if not s or "@" in s or any(c.isdigit() for c in s) or _section_of(s) or "http" in s.lower():
            continue
        words = s.split()
        if 2 <= len(words) <= 4 and all(w[:1].isupper() or w.isupper() for w in words if w.isalpha()) and all(re.fullmatch(r"[A-Za-z.'\-]+", w) for w in words):
            return " ".join(w.capitalize() if w.isupper() else w for w in words)
    return None


def find_skills(text: str, vocab: list[str]) -> list[dict]:
    """Skills found in the text with the line that evidences each one."""
    found: dict[str, str] = {}
    lines = [_clean(l) for l in text.splitlines() if l.strip()]
    terms = {v: v for v in vocab} | {a: c for a, c in SKILL_ALIASES.items() if c in vocab}
    for term, canon in sorted(terms.items(), key=lambda kv: -len(kv[0])):
        pat = re.compile(r"(?<![a-z0-9+#])" + re.escape(term) + r"(?![a-z0-9+#])", re.I)
        for l in lines:
            if pat.search(l):
                found.setdefault(canon, l[:160])
                break
    return [{"name": k, "evidence": v} for k, v in sorted(found.items())]


def parse_resume(text: str, vocab: list[str]) -> dict:
    raw_lines = [l for l in text.splitlines()]
    sections: dict[str, list[str]] = {}
    current = None
    for line in raw_lines:
        sec = _section_of(line)
        if sec:
            current = sec
            sections.setdefault(sec, [])
        elif current and line.strip():
            sections[current].append(_clean(line))
    cap = lambda items, n=12: [i for i in dict.fromkeys(x for x in items if len(x) >= 3)][:n]
    projects = []
    for l in sections.get("projects", []):
        if re.match(r"^[A-Z0-9]", l) and (len(l) < 90 or ":" in l or " - " in l or " — " in l):
            projects.append(l)
    email = EMAIL_RE.search(text)
    links = []
    for m in URL_RE.finditer(text):
        u = "https://" + m.group(1).rstrip("/.,)")
        if u not in links:
            links.append(u)
    return {
        "name": _guess_name(raw_lines), "email": email.group(0) if email else None, "links": links[:6],
        "education": cap(sections.get("education", [])), "projects": cap(projects or sections.get("projects", []), 8),
        "certifications": cap(sections.get("certifications", [])), "experience": cap(sections.get("experience", [])),
        "achievements": cap(sections.get("achievements", [])), "skills": find_skills(text, vocab),
        "sectionsFound": sorted(sections), "charactersRead": len(text),
    }
