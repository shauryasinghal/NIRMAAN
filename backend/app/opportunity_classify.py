"""
Derives category, participation mode, team-size range and source trust type
from an opportunity's own title/organization/source text. Every value here
is a classification of real data already on the record - nothing is invented
(no participant counts, no prize amounts, no verification claims beyond
"this source is a known aggregator vs. a direct organizational source").
"""
import re

CATEGORY_PATTERNS = [
    ("Hackathon", r"hack(athon)?|hackfest|buildathon|codesprint"),
    ("Internship", r"intern(ship)?"),
    ("Scholarship", r"scholarship"),
    ("Fellowship", r"fellowship"),
    ("Competition", r"challenge|competition|cup|contest|case cup"),
    ("Workshop", r"workshop|bootcamp"),
    ("Conference", r"conference|symposium|summit"),
    ("Quiz", r"quiz|trivia"),
    ("CTF", r"ctf|capture the flag"),
    ("Research", r"research|fellowship program"),
]

# Known aggregator/listing platforms vs. organizations publishing their own opportunity directly.
KNOWN_AGGREGATORS = {
    "unstop", "devpost", "hackerearth", "kaggle", "devfolio", "github education",
}

TEAM_CATEGORIES = {"Hackathon", "Competition", "CTF"}


def classify_category(title: str) -> str:
    t = title.lower()
    for label, pattern in CATEGORY_PATTERNS:
        if re.search(pattern, t):
            return label
    return "Open Innovation"


def classify_participation(category: str):
    if category in TEAM_CATEGORIES:
        return "team", 2, 4
    return "individual", None, None


def classify_source_type(source: str) -> str:
    return "aggregator" if source.strip().lower() in KNOWN_AGGREGATORS else "official"
