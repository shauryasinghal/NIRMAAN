import os
import datetime as dt
import bcrypt
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from . import models

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False  # Google-only account — no password to check
    return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))


def create_access_token(subject: str, role: str) -> str:
    expire = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_student(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Student:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        student_id: str = payload.get("sub")
        if student_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    if student is None:
        raise credentials_exception
    return student


def require_reviewer(student: models.Student = Depends(get_current_student)) -> models.Student:
    if student.role != "REVIEWER":
        raise HTTPException(status_code=403, detail="Reviewer role required")
    return student
