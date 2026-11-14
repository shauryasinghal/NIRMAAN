# NIRMAAN — Discover | Validate | Build

Discover opportunities that fit you, understand *why*, build a team that covers what's missing, validate an idea
before you build it, apply, and improve — one connected loop:

**DISCOVER → UNDERSTAND → BUILD → VALIDATE → APPLY → IMPROVE**

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · Supabase JS (Auth) — deployed on Vercel |
| API | Python · FastAPI · SQLAlchemy Core · Pydantic v2 — verifies Supabase JWTs, runs the engines |
| Data + Auth | **Supabase**: Postgres 17 · Supabase Auth (email + Google) · Row Level Security · pgvector · pg_cron |
| AI | Explainable fit engine · skill-coverage team builder · MiniLM-L6-v2 (384-d) embeddings + pgvector cosine search |

Supabase is the source of truth. The API never issues tokens; it verifies Supabase's, derives identity **and role**
from the database (never from the client), and runs every request as the Postgres `authenticated` role with the
caller's claims so RLS applies to the API exactly as it does to a direct client.

> **Honest status (last reviewed 2026-10-06).** Current local worktree: 155 backend tests and 85 frontend unit tests pass; TypeScript passes; oxlint reports warnings but no errors. The last green CI run on `main` (`8c13922`) passed 49 database security checks, 221 Playwright E2E tests and one CSP test. Those CI results predate the current uncommitted local changes.
> **Hosted Supabase (`nirmaan`):** 21 migrations were confirmed applied on 2026-10-01. A separately approved demo seed on 2026-10-01 added 64 clearly labelled, unverified demo opportunities, 28 organizations and 50 reference ideas; existing user/profile rows were unchanged in the before/after check.
> **Not done / not verified:** production frontend/backend deployment and Docker build; a complete real Google sign-in callback/session; current hosted security-advisor state. The hosted catalog contains demo fixtures, not a real external feed. The Unstop manifest has not been imported.
> See [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## Repository map

```
backend/    FastAPI service, engines, ingestion pipeline, jobs, tests, eval/
frontend/   React app, unit tests, Playwright E2E (e2e/)
supabase/   migrations/ (from zero + upgrade path), local/ (Supabase stub for offline dev), tests/ (RLS, upgrade)
docs/       ARCHITECTURE · SECURITY · DEPLOYMENT · EVALUATION · FEATURE_MATRIX · AUDIT
```

## Run it locally (no Docker, no Supabase account needed)

Prerequisites: Postgres 17 with the `pgvector` extension (`brew install postgresql@17 pgvector`), Python 3.13, Node 22.

```bash
# 1. Database: rebuild a scratch Postgres from ZERO (Supabase stub + every migration) and prove it is secure
supabase/tests/run.sh                 # 49 role/RLS/IDOR checks

# 2. Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # optional: smaller CPU-only torch
pip install -r requirements-dev.txt
cp .env.example .env                  # local defaults work; see the file for every variable
../supabase/local/reset.sh nirmaan_dev      # scratch DB from zero (refuses non-local hosts)
python -m app.devseed all             # demo catalog + 50 reference ideas (real MiniLM embeddings) + demo students
uvicorn app.main:app --reload         # http://localhost:8000/docs

# 3. Frontend (against the hosted or local Supabase Auth)
cd ../frontend && npm ci && cp .env.example .env.local   # set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                           # http://localhost:5173
```

Locally there is no GoTrue, so sign-in needs a Supabase project (hosted, or `supabase start` if you have Docker).
The automated E2E suite uses a small **test-only** stand-in for Supabase Auth's HTTP endpoints
(`backend/e2e/fake_gotrue.py`) so the real frontend, API and Postgres schema are exercised together.

## Tests

```bash
supabase/tests/run.sh && supabase/tests/upgrade_test.sh     # database security + upgrade path
cd backend  && ./venv/bin/python -m pytest tests            # 527 tests (real MiniLM + pgvector for originality; Gemini stage mocked)
cd frontend && npm test                                     # 163 unit/component tests
cd frontend && npx playwright test                          # 222 E2E: auth, discovery, team, originality, applications,
                                                            #   alerts, resume, reviewer/admin, axe a11y, 8 viewport widths
cd frontend && npx playwright test -c playwright.csp.config.ts   # production build under the real CSP headers
cd backend  && ./venv/bin/python -m eval.originality_eval        # ML quality numbers (docs/EVALUATION.md)
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Security model & audit](docs/SECURITY.md) · [Deployment](docs/DEPLOYMENT.md)
- [AI evaluation](docs/EVALUATION.md) · [Originality: Gemini deep analysis](docs/ORIGINALITY_AI.md) · [Feature matrix](docs/FEATURE_MATRIX.md) · [Original audit](docs/AUDIT.md)

## Principles that shape the product

- **No fabricated data.** Unknown is `NULL`/"Not listed", never a default. Demo data is labelled "Demo data" everywhere and never links out.
- **Explainable AI.** Every fit score is reproducible and itemised; unknown inputs are excluded, not guessed. Originality never says "100% original" and always states that similarity is not plagiarism; the optional Gemini stage explains matches in words and is kept apart from the measured similarity, never blended into a score.
- **Consent.** Students appear in Team Builder only after opting in. Personalisation signals are visible and resettable.
- **Server-side authority.** Roles change only through an audited, admin-only database function. The UI hides things for convenience; the API and database enforce.

*NIRMAAN — GLA University B.Tech CSE (AI/ML) mini-project · Team Code Blooded (T-102) · Shaurya Singhal, Tahaseen Khan, Vedika Agarwal · Mentor: Miss Chhavi Bajpai.*
