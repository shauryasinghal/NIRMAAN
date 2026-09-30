def test_register_and_login(client):
    r = client.post("/api/auth/register", json={"name": "Alex Kumar", "email": "alex.kumar@gla.demo", "password": "secret123"})
    assert r.status_code == 201

    r = client.post("/api/auth/login", json={"email": "alex.kumar@gla.demo", "password": "secret123"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["role"] == "STUDENT"


def test_duplicate_email_rejected(client):
    client.post("/api/auth/register", json={"name": "Dupe", "email": "dupe@gla.demo", "password": "secret123"})
    r = client.post("/api/auth/register", json={"name": "Dupe2", "email": "dupe@gla.demo", "password": "secret123"})
    assert r.status_code == 400


def test_wrong_password_rejected(client):
    client.post("/api/auth/register", json={"name": "Sam", "email": "sam@gla.demo", "password": "correctpw"})
    r = client.post("/api/auth/login", json={"email": "sam@gla.demo", "password": "wrongpw"})
    assert r.status_code == 401


def test_protected_endpoint_requires_token(client):
    r = client.get("/api/profile")
    assert r.status_code == 401
