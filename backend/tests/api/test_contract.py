"""API contract + authorization coverage, derived from the OpenAPI schema so new routes are checked automatically."""
import re

PUBLIC = {("get", "/api/auth/config"), ("get", "/health"), ("get", "/ready")}
INTERNAL = {("post", "/api/internal/jobs/{name}")}          # protected by X-Cron-Secret instead of a user token


def routes(app):
    spec = app.openapi()
    for path, ops in spec["paths"].items():
        for method in ops:
            if method in ("get", "post", "put", "patch", "delete"):
                yield method, path, ops[method]


def fill(path):
    return re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000000", path)


def test_every_api_route_rejects_anonymous_requests(client):
    app = client.app
    seen = 0
    for method, path, _ in routes(app):
        if (method, path) in PUBLIC or path in ("/openapi.json", "/docs", "/redoc"):
            continue
        r = client.request(method, fill(path), json={} if method != "get" else None)
        if (method, path) in INTERNAL:
            assert r.status_code == 403, (method, path, r.status_code)
        else:
            assert r.status_code == 401, f"{method.upper()} {path} answered {r.status_code} without a token"
        seen += 1
    assert seen >= 60


def test_role_gated_routes_reject_students(client, student):
    for method, path, _ in routes(client.app):
        if path.startswith(("/api/admin", "/api/reviewer")):
            r = client.request(method, fill(path), headers=student.h, json={} if method != "get" else None)
            assert r.status_code == 403, f"{method.upper()} {path} answered {r.status_code} for a student"


def test_admin_routes_reject_reviewers(client, reviewer):
    for method, path, _ in routes(client.app):
        if path.startswith("/api/admin"):
            r = client.request(method, fill(path), headers=reviewer.h, json={} if method != "get" else None)
            assert r.status_code == 403, f"{method.upper()} {path} answered {r.status_code} for a reviewer"


def test_no_route_accepts_client_supplied_identity_or_role(client):
    """user_id / role / studentId must never be an input anywhere — except the two admin-only cases listed here."""
    forbidden = re.compile(r"^(user_?id|student_?id|owner_?id|role|profile_?id)$", re.I)
    allowed = {("get", "/api/admin/users", "query:role"), ("put", "/api/admin/users/{user_id}/role", "body:role")}
    spec = client.app.openapi()
    offenders = []
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            for p in op.get("parameters", []):
                if p["in"] in ("query", "header") and forbidden.match(p["name"]) and (method, path, f"query:{p['name']}") not in allowed:
                    offenders.append(f"{method.upper()} {path} param {p['name']}")
            ref = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {}).get("$ref")
            if ref:
                for k in spec["components"]["schemas"][ref.split("/")[-1]].get("properties", {}):
                    if forbidden.match(k) and (method, path, f"body:{k}") not in allowed:
                        offenders.append(f"{method.upper()} {path} body {k}")
    assert not offenders, offenders


def test_openapi_documents_bearer_auth_and_typed_responses(client):
    spec = client.app.openapi()
    assert "HTTPBearer" in spec["components"]["securitySchemes"]
    op = spec["paths"]["/api/opportunities"]["get"]
    assert op["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("OpportunityPage")
    names = set(spec["components"]["schemas"])
    assert {"OpportunityCard", "OpportunityDetail", "ProfileOut", "ProfileUpdate", "ApplicationOut", "AlertOut", "NotificationPage"} <= names
    assert spec["info"]["title"] == "NIRMAAN API"
