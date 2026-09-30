from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, security
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(payload: schemas.RegisterIn, db: Session = Depends(get_db)):
    if db.query(models.Student).filter(models.Student.email == payload.email).first():
        raise HTTPException(status_code=400, detail={"code": "EMAIL_TAKEN", "message": "Email already registered"})
    if payload.role not in ("STUDENT", "REVIEWER"):
        raise HTTPException(status_code=400, detail={"code": "INVALID_ROLE", "message": "role must be STUDENT or REVIEWER"})
    student = models.Student(
        name=payload.name,
        email=payload.email,
        hashed_password=security.hash_password(payload.password),
        role=payload.role,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return {"id": student.id}


@router.post("/login", response_model=schemas.TokenOut)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.email == payload.email).first()
    if student and student.hashed_password is None:
        raise HTTPException(status_code=401, detail={
            "code": "GOOGLE_ONLY_ACCOUNT",
            "message": "This account was created with Google sign-in — use \"Continue with Google\" instead.",
        })
    if not student or not security.verify_password(payload.password, student.hashed_password):
        raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS", "message": "Incorrect email or password"})
    token = security.create_access_token(student.id, student.role)
    return {"access_token": token, "role": student.role}
