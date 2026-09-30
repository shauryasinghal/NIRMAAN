"""Normalise, classify and validate raw records into Candidates."""
from __future__ import annotations

import datetime as dt
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .models import Candidate

TRACKING = re.compile(r"^(utm_|fbclid|gclid|mc_|ref$|ref_|source$)", re.I)

SKILL_ALIASES = {
    "ml": "machine learning", "machinelearning": "machine learning", "ai": "machine learning", "dl": "deep learning",
    "reactjs": "react", "react.js": "react", "js": "javascript", "ts": "typescript", "py": "python", "nlp": "nlp",
    "postgres": "sql", "postgresql": "sql", "mysql": "sql", "k8s": "devops", "ci/cd": "devops", "aws": "cloud", "gcp": "cloud", "azure": "cloud",
    "ux": "ui/ux", "ui": "ui/ux", "ui-ux": "ui/ux", "rest": "api design", "rest api": "api design", "api": "api design", "security": "cybersecurity",
    "infosec": "cybersecurity", "data": "data science", "datascience": "data science", "embedded": "iot",
}

CATEGORY_PATTERNS = [
    ("CTF", r"\bctf\b|capture the flag"), ("Hackathon", r"hack(athon)?|hackfest|buildathon|codesprint|ideathon|jam\b"),
    ("Internship", r"intern(ship)?"), ("Scholarship", r"scholarship"), ("Fellowship", r"fellowship"),
    ("Workshop", r"workshop|bootcamp|sprint\b"), ("Conference", r"conference|symposium|summit"), ("Quiz", r"quiz|trivia"),
    ("Research", r"research"), ("Competition", r"challenge|competition|\bcup\b|contest|case cup"),
]
DOMAIN_KEYWORDS = {"ai-ml": ("machine learning", "deep learning", "nlp", "artificial intelligence", " ai "), "fintech": ("fintech", "payments", "banking"),
                   "healthtech": ("health", "medical"), "climatetech": ("climate", "sustainab"), "edtech": ("edtech", "education"),
                   "cybersecurity": ("cybersecurity", "security", "ctf"), "cloud": ("cloud",), "devops": ("devops",), "web-development": ("web ",),
                   "data-science": ("data science", "analytics")}


def canonical_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        p = urlsplit(url.strip())
    except ValueError:
        return None
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    query = urlencode([(k, v) for k, v in parse_qsl(p.query, keep_blank_values=False) if not TRACKING.match(k)])
    path = re.sub(r"/{2,}", "/", p.path).rstrip("/") or ""
    host = p.netloc.lower().removeprefix("www.")
    return urlunsplit(("https", host, path, query, ""))


def norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def normalise_skills(skills, vocab: set[str]) -> tuple[list[str], list[str]]:
    """→ (known skills from the controlled vocabulary, leftover strings that become tags)."""
    known, extra = [], []
    for raw in skills or []:
        s = str(raw).strip().lower()
        s = SKILL_ALIASES.get(s, s)
        (known if s in vocab else extra).append(s)
    return sorted(set(known)), sorted({e for e in extra if e and len(e) <= 40})


def classify_category(title: str, given: str | None = None) -> str | None:
    if given:
        return given.strip()[:80]
    t = title.lower()
    for label, pattern in CATEGORY_PATTERNS:
        if re.search(pattern, t):
            return label
    return None


def guess_domain(explicit: str | None, title: str, skills: list[str], interest_slugs: set[str], interest_names: dict[str, str]) -> str | None:
    if explicit:
        e = explicit.strip().lower()
        if e in interest_slugs:
            return e
        return interest_names.get(e)
    return None    # we do not guess a domain from keywords: unknown stays unknown


def parse_date(v) -> dt.date | None:
    if v in (None, ""):
        return None
    if isinstance(v, dt.date):
        return v
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def to_candidate(external_id: str, d: dict, vocab: set[str], interest_slugs: set[str], interest_names: dict[str, str]) -> Candidate:
    required, extra_req = normalise_skills(d.get("requiredSkills") or d.get("skills"), vocab)
    preferred, extra_pref = normalise_skills(d.get("preferredSkills"), vocab)
    preferred = [s for s in preferred if s not in required]
    tags = sorted({str(t).strip().lower() for t in (d.get("tags") or []) if str(t).strip()} | set(extra_req) | set(extra_pref))[:20]
    title = re.sub(r"\s+", " ", str(d.get("title") or "")).strip()
    url = d.get("officialUrl")
    stip = d.get("stipendAmount")
    return Candidate(
        external_id=external_id, title=title, organization=re.sub(r"\s+", " ", str(d.get("organization") or "")).strip(),
        description=re.sub(r"<[^>]+>", " ", str(d.get("description") or "")).strip()[:5000], category=classify_category(title, d.get("category")),
        subcategory=d.get("subcategory"), domain=guess_domain(d.get("domain"), title, required, interest_slugs, interest_names), tags=tags,
        required_skills=required, preferred_skills=preferred, difficulty=d.get("difficulty"), format=d.get("format"), work_mode=d.get("workMode"),
        participation=d.get("participation"), min_team_size=d.get("minTeamSize"), max_team_size=d.get("maxTeamSize"), location=d.get("location"),
        eligibility=d.get("eligibility"), education_requirements=d.get("educationRequirements"), experience_requirements=d.get("experienceRequirements"),
        prize_text=d.get("prizeText"), stipend_amount=float(stip) if stip is not None else None, stipend_currency=d.get("stipendCurrency"),
        salary_text=d.get("salaryText"), certificate=d.get("certificate"), registration_start=parse_date(d.get("registration_start")),
        deadline=parse_date(d.get("deadline")), event_start=parse_date(d.get("event_start")), event_end=parse_date(d.get("event_end")),
        official_url=canonical_url(url) and url, application_url=d.get("applicationUrl") if canonical_url(d.get("applicationUrl")) else None,
        canonical_url=canonical_url(url),
    )


def validate(c: Candidate) -> list[str]:
    """Business-rule rejections beyond the Pydantic field checks."""
    problems = []
    if c.min_team_size and c.max_team_size and c.max_team_size < c.min_team_size:
        problems.append("max_team_size < min_team_size")
    if c.event_start and c.event_end and c.event_end < c.event_start:
        problems.append("event_end before event_start")
    if c.registration_start and c.deadline and c.deadline < c.registration_start:
        problems.append("deadline before registration_start")
    if c.deadline and c.deadline < dt.date.today() - dt.timedelta(days=365):
        problems.append("deadline more than a year in the past")
    return problems
