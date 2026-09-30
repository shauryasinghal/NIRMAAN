"""
Generates a standard iCalendar (.ics) file for an opportunity's deadline.
This works TODAY, for every user, with zero configuration - no Google OAuth
needed, because .ics is an open format every calendar app (Google, Apple,
Outlook) already knows how to import. This is the real, always-available
"add to calendar" path; the Google Calendar OAuth integration
(routers/calendar.py) is an optional upgrade on top of it, not a
replacement - and only works once real OAuth credentials are configured.
"""
import datetime as dt
import uuid


def build_ics(title: str, description: str, deadline: dt.date, url: str = "") -> str:
    dtstamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dtstart = deadline.strftime("%Y%m%d")
    event_uid = str(uuid.uuid4())
    # All-day event on the deadline date. DTEND is exclusive per RFC 5545, so +1 day.
    dtend = (deadline + dt.timedelta(days=1)).strftime("%Y%m%d")

    def esc(text: str) -> str:
        return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//NIRMAAN//Opportunity Deadlines//EN",
        "BEGIN:VEVENT",
        f"UID:{event_uid}",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART;VALUE=DATE:{dtstart}",
        f"DTEND;VALUE=DATE:{dtend}",
        f"SUMMARY:{esc('Deadline: ' + title)}",
        f"DESCRIPTION:{esc(description + (chr(10) + url if url else ''))}",
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        "DESCRIPTION:Deadline tomorrow",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"
