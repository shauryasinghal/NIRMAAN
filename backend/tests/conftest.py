import os
import tempfile
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    # Isolated SQLite file per test run so tests never touch nirmaan.db
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

    from app.main import app
    with TestClient(app) as c:
        yield c

    os.remove(db_path)


@pytest.fixture()
def student_auth(client):
    """Registers a fresh student and returns (email, auth_headers)."""
    import uuid
    email = f"test-{uuid.uuid4().hex[:8]}@gla.demo"
    client.post("/api/auth/register", json={"name": "Test Student", "email": email, "password": "pass1234"})
    res = client.post("/api/auth/login", json={"email": email, "password": "pass1234"})
    token = res.json()["access_token"]
    return email, {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def reviewer_auth(client):
    res = client.post("/api/auth/login", json={"email": "reviewer@gla.demo", "password": "demo1234"})
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
