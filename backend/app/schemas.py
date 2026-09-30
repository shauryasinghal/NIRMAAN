from pydantic import BaseModel, EmailStr
from typing import List, Optional


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "STUDENT"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class ProfileIn(BaseModel):
    year: Optional[str] = None
    branch: Optional[str] = None
    skills: List[str] = []
    interests: List[str] = []
    experience_level: str = "beginner"
    availability_hrs: int = 5


class ProfileOut(ProfileIn):
    id: str
    name: str
    email: str
    profile_complete: bool


class TeamRequestIn(BaseModel):
    target_skills: List[str]
    team_size: int = 4


class IdeaCheckIn(BaseModel):
    title: str
    description: str
    domain: Optional[str] = None


class ReviewDecisionIn(BaseModel):
    decision: str  # confirm_overlap | dismiss | needs_review
