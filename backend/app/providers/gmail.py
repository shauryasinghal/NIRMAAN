"""
Gmail provider interface.

HONEST STATUS: NIRMAAN doesn't currently send any email (no email
notifications, no digest, nothing) - so there is no product feature for this
to plug into yet. This module exists only as the adapter interface Phase 8
asked for, so that email support can be added later without inventing a new
architecture. It is NOT called from anywhere else in the codebase. Do not
present a "Gmail connected" UI state to users based on this alone - that
would be exactly the fake integration the project's own rules forbid.

If/when a real feature needs to send mail, implement GoogleGmailProvider's
`send()` using the Gmail API with the OAuth token from GoogleAccount
(same token store the Calendar integration uses, with an added
`https://www.googleapis.com/auth/gmail.send` scope).
"""
from abc import ABC, abstractmethod


class GmailProvider(ABC):
    @abstractmethod
    def send(self, to: str, subject: str, body: str) -> bool:
        ...


class GoogleGmailProvider(GmailProvider):
    """Real implementation - NOT YET IMPLEMENTED. Wire this up only once a
    concrete feature (e.g. application-deadline email reminders) needs it,
    using a stored GoogleAccount access token with gmail.send scope."""
    def send(self, to: str, subject: str, body: str) -> bool:
        raise NotImplementedError("Gmail sending is not implemented — no NIRMAAN feature uses it yet.")


class LocalDevelopmentProvider(GmailProvider):
    """Development-only stand-in. Never claims to have sent real mail -
    just records the call so a developer can verify the call site works."""
    def __init__(self):
        self.sent = []

    def send(self, to: str, subject: str, body: str) -> bool:
        self.sent.append({"to": to, "subject": subject, "body": body})
        return True
