"""Standard iCalendar (.ics) for an opportunity deadline. Works for every user with zero configuration and
no OAuth — every calendar app can import it. The Google Calendar connection is an optional extra on top."""
from __future__ import annotations

import datetime as dt


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\r", "").replace("\n", "\\n")


def build_ics(uid: str, title: str, description: str, deadline: dt.date, url: str = "") -> str:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NIRMAAN//Opportunity Deadlines//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
             f"UID:{uid}@nirmaan", f"DTSTAMP:{stamp}", f"DTSTART;VALUE=DATE:{deadline:%Y%m%d}", f"DTEND;VALUE=DATE:{deadline + dt.timedelta(days=1):%Y%m%d}",
             f"SUMMARY:{_esc('Deadline: ' + title)}", f"DESCRIPTION:{_esc(description + ((chr(10) + url) if url else ''))}",
             "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Deadline tomorrow", "END:VALARM", "END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"
