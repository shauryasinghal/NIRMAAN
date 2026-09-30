import os
os.chdir(os.path.dirname(__file__))
if os.path.exists("nirmaan.db"):
    os.remove("nirmaan.db")

from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)

print("HEALTH:", c.get("/health").json())

# Register + login a fresh student
r = c.post("/api/auth/register", json={"name": "Test Student", "email": "smoketest@gla.demo", "password": "pass1234"})
print("REGISTER:", r.status_code)
r = c.post("/api/auth/login", json={"email": "smoketest@gla.demo", "password": "pass1234"})
print("LOGIN:", r.status_code, r.json().keys())
token = r.json()["access_token"]
h = {"Authorization": f"Bearer {token}"}

# Save profile
r = c.put("/api/profile", json={"branch": "CSE (AI/ML)", "year": "3",
                                 "skills": ["python", "machine learning", "nlp"],
                                 "interests": ["ai/ml"], "experience_level": "intermediate",
                                 "availability_hrs": 8}, headers=h)
print("PROFILE UPDATE:", r.status_code, r.json()["profile_complete"])

# Recommendations (real TF-IDF cosine similarity over seeded opportunities)
r = c.get("/api/opportunities/recommend?topK=5", headers=h)
print("RECOMMEND status:", r.status_code)
for item in r.json()["items"]:
    print("  ->", item["title"], item["fitScore"], item["matchedSkills"])

# Team builder (real weighted-graph greedy selection over seeded students)
r = c.post("/api/team/suggest", json={"target_skills": ["react", "python", "machine learning", "ui/ux"], "team_size": 3}, headers=h)
print("TEAM status:", r.status_code)
print("  members:", [m["name"] for m in r.json()["members"]])
print("  diversityScore:", r.json()["diversityScore"], "coverageScore:", r.json()["coverageScore"])

# Originality checker (real similarity against seeded prior-idea corpus)
r = c.post("/api/idea/check", json={
    "title": "Hackathon teammate matcher",
    "description": "A platform for finding teammates with matching or complementary technical skills for hackathons.",
}, headers=h)
print("IDEA CHECK status:", r.status_code)
print("  noveltyScore:", r.json()["noveltyScore"], "status:", r.json()["status"], "embeddingMode:", r.json()["embeddingMode"])
print("  top match:", r.json()["matches"][0]["title"], r.json()["matches"][0]["similarity"])

# History
r = c.get("/api/idea/history", headers=h)
print("HISTORY items:", len(r.json()["items"]))

# Reviewer flow
r = c.post("/api/auth/login", json={"email": "reviewer@gla.demo", "password": "demo1234"})
rh = {"Authorization": f"Bearer {r.json()['access_token']}"}
r = c.get("/api/reviewer/queue", headers=rh)
print("REVIEW QUEUE size:", len(r.json()["items"]))

print("\nALL SMOKE TESTS COMPLETED")
