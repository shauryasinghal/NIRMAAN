import datetime as dt


def deadline_urgency(deadline: dt.date | None) -> dict:
    """Classify a deadline relative to today. Returns ISO date, days-remaining,
    an urgency band, and whether it has already passed — computed server-side
    so the frontend never has to guess or fake this."""
    if deadline is None:
        return {"deadline": None, "daysRemaining": None, "urgency": "unknown", "isExpired": False}

    today = dt.date.today()
    days = (deadline - today).days

    if days < 0:
        urgency = "expired"
    elif days <= 3:
        urgency = "critical"
    elif days <= 10:
        urgency = "soon"
    else:
        urgency = "open"

    return {
        "deadline": deadline.isoformat(),
        "daysRemaining": days,
        "urgency": urgency,
        "isExpired": days < 0,
    }
