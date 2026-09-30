import datetime as dt
from fastapi import APIRouter, Depends, HTTPException, Query
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from .. import models, security, google_oauth
from ..database import get_db

router = APIRouter(prefix="/api/auth/google", tags=["auth-google"])

STATE_SECRET = security.SECRET_KEY  # reuse the app's JWT secret to sign short-lived OAuth state tokens


def _make_state() -> str:
    payload = {"purpose": "oauth_state", "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)}
    return jwt.encode(payload, STATE_SECRET, algorithm="HS256")


def _verify_state(state: str) -> bool:
    try:
        payload = jwt.decode(state, STATE_SECRET, algorithms=["HS256"])
        return payload.get("purpose") == "oauth_state"
    except JWTError:
        return False


@router.get("/status")
def google_status():
    """The frontend calls this to decide whether to show/enable the
    'Continue with Google' button at all - never a fake button."""
    return {"configured": google_oauth.is_configured()}


@router.get("/login")
def google_login():
    if not google_oauth.is_configured():
        raise HTTPException(status_code=503, detail={
            "code": "GOOGLE_NOT_CONFIGURED",
            "message": "Google sign-in is not configured in this environment.",
        })
    state = _make_state()
    url = google_oauth.build_authorization_url(state, scopes=google_oauth.LOGIN_SCOPES)
    return {"authorizationUrl": url}


@router.get("/callback")
def google_callback(code: str = Query(...), state: str = Query(...), db: Session = Depends(get_db)):
    if not google_oauth.is_configured():
        raise HTTPException(status_code=503, detail={"code": "GOOGLE_NOT_CONFIGURED", "message": "Google sign-in is not configured."})
    if not _verify_state(state):
        raise HTTPException(status_code=400, detail={"code": "INVALID_OAUTH_STATE", "message": "OAuth state is invalid or expired — please try signing in again."})

    try:
        tokens = google_oauth.exchange_code_for_tokens(code)
        userinfo = google_oauth.fetch_userinfo(tokens["access_token"])
    except Exception:
        raise HTTPException(status_code=502, detail={"code": "GOOGLE_OAUTH_FAILED", "message": "Google sign-in failed. Please try again."})

    google_sub = userinfo.get("sub")
    email = userinfo.get("email")
    name = userinfo.get("name") or email
    if not google_sub or not email:
        raise HTTPException(status_code=502, detail={"code": "GOOGLE_OAUTH_INCOMPLETE", "message": "Google did not return the expected identity information."})

    student = db.query(models.Student).filter(models.Student.google_sub == google_sub).first()
    if not student:
        # Account linking: an existing email/password account with the same verified email gets linked, not duplicated.
        student = db.query(models.Student).filter(models.Student.email == email).first()
        if student:
            student.google_sub = google_sub
        else:
            student = models.Student(name=name, email=email, google_sub=google_sub, role="STUDENT")
            db.add(student)
        db.commit()
        db.refresh(student)

    token = security.create_access_token(student.id, student.role)
    return {"access_token": token, "role": student.role, "isNewProfile": not student.profile_complete}
