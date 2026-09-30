import uuid
import datetime as dt
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Date, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from .database import Base


def uid():
    return str(uuid.uuid4())


class Student(Base):
    __tablename__ = "students"
    id = Column(String, primary_key=True, default=uid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)  # nullable — Google-only accounts have no password
    google_sub = Column(String, unique=True, nullable=True, index=True)  # Google's stable user id ("sub" claim)
    role = Column(String, default="STUDENT")  # STUDENT | REVIEWER
    year = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    skills = Column(JSON, default=list)         # ["python","ml",...]
    interests = Column(JSON, default=list)       # ["ai/ml","fintech",...]
    experience_level = Column(String, default="beginner")
    availability_hrs = Column(Integer, default=5)
    profile_complete = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class Opportunity(Base):
    __tablename__ = "opportunities"
    id = Column(String, primary_key=True, default=uid)
    title = Column(String, nullable=False)
    organization = Column(String, nullable=False)
    domain = Column(String, nullable=False)
    category = Column(String, nullable=True, index=True)   # Hackathon | Internship | Scholarship | ... — derived from title, not invented
    required_skills = Column(JSON, default=list)
    description = Column(Text, default="")
    deadline = Column(Date, nullable=True)  # real date — enables urgency/expiry computation
    format = Column(String, default="online")     # online | offline | hybrid
    difficulty = Column(String, default="intermediate")
    participation = Column(String, nullable=True)  # individual | team — real default by category, never a fabricated headcount
    min_team_size = Column(Integer, nullable=True)
    max_team_size = Column(Integer, nullable=True)
    source = Column(String, default="Seeded Demo Data")
    source_type = Column(String, default="aggregator")  # official | aggregator — classified from the real source field
    external_url = Column(String, default="#")
    updated_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class RecommendationLog(Base):
    __tablename__ = "recommendation_logs"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"))
    opportunity_id = Column(String, ForeignKey("opportunities.id"))
    fit_score = Column(Float)
    rank = Column(Integer)
    shown_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class Team(Base):
    __tablename__ = "teams"
    id = Column(String, primary_key=True, default=uid)
    requested_by = Column(String, ForeignKey("students.id"))
    target_skills = Column(JSON, default=list)
    member_ids = Column(JSON, default=list)
    diversity_score = Column(Float, default=0.0)
    coverage_score = Column(Float, default=0.0)
    formed_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class IdeaSubmission(Base):
    __tablename__ = "idea_submissions"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"))
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    domain = Column(String, nullable=True)
    novelty_score = Column(Float)
    top_similarity = Column(Float)
    status = Column(String, default="novel")   # novel | needs_review | confirmed_overlap | dismissed
    matches = Column(JSON, default=list)        # [{id,title,similarity,...}]
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class PriorIdea(Base):
    """Reference corpus the Originality Checker screens against."""
    __tablename__ = "prior_ideas"
    id = Column(String, primary_key=True, default=uid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    source = Column(String, default="Seeded corpus")


class Review(Base):
    __tablename__ = "reviews"
    id = Column(String, primary_key=True, default=uid)
    idea_id = Column(String, ForeignKey("idea_submissions.id"))
    reviewer_id = Column(String, ForeignKey("students.id"))
    decision = Column(String, nullable=True)   # confirm_overlap | dismiss | needs_review
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class SavedOpportunity(Base):
    """A student's bookmark on an opportunity. Server-owned — never localStorage."""
    __tablename__ = "saved_opportunities"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"), index=True)
    opportunity_id = Column(String, ForeignKey("opportunities.id"), index=True)
    saved_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


# The application pipeline a student can move an opportunity through.
APPLICATION_STATUSES = [
    "wishlist", "saved", "planning", "applying", "applied",
    "shortlisted", "interview", "selected", "rejected", "withdrawn",
]


class Application(Base):
    __tablename__ = "applications"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"), index=True)
    opportunity_id = Column(String, ForeignKey("opportunities.id"), index=True)
    status = Column(String, default="wishlist")
    notes = Column(Text, default="")
    next_action = Column(String, nullable=True)
    reminder_at = Column(Date, nullable=True)
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class ApplicationEvent(Base):
    """Real activity-history entries for one application — never fabricated."""
    __tablename__ = "application_events"
    id = Column(String, primary_key=True, default=uid)
    application_id = Column(String, ForeignKey("applications.id"), index=True)
    kind = Column(String, nullable=False)   # status_changed | note_added | reminder_set | created
    detail = Column(String, default="")
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"), index=True)
    kind = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, default="")
    link = Column(String, nullable=True)   # deep link, e.g. /opportunities/{id}
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class SavedSearch(Base):
    """'Alert me when...' — persisted query + filters. See routers/saved_searches.py
    docstring for the honest limitation: no background job currently evaluates these."""
    __tablename__ = "saved_searches"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"), index=True)
    name = Column(String, nullable=False)
    query = Column(String, default="")
    domain = Column(String, nullable=True)
    skill = Column(String, nullable=True)
    min_fit = Column(Float, nullable=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class ActivityEvent(Base):
    """Unified activity stream — every entry corresponds to something that
    genuinely happened (an API call), never a fabricated event."""
    __tablename__ = "activity_events"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"), index=True)
    kind = Column(String, nullable=False)  # opportunity_saved | opportunity_viewed | application_status_changed | team_created | idea_checked | profile_updated
    title = Column(String, nullable=False)
    link = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))


class GoogleAccount(Base):
    """Stores an OPTIONAL, separately-consented Google Calendar connection.
    This is distinct from Google login (Student.google_sub) — a student can
    log in with Google without ever connecting Calendar, and can log in with
    email/password while still connecting Calendar. Tokens are only ever
    populated when real Google OAuth credentials are configured and the
    student completes the consent flow; nothing here is fabricated."""
    __tablename__ = "google_accounts"
    id = Column(String, primary_key=True, default=uid)
    student_id = Column(String, ForeignKey("students.id"), unique=True, index=True)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    scopes = Column(JSON, default=list)
    connected_at = Column(DateTime, default=lambda: dt.datetime.now(dt.timezone.utc))
