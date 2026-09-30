# NIRMAAN — The AI Operating System for Student Innovation

A working, end-to-end student innovation platform: a React/TypeScript frontend
talking to a FastAPI backend that runs three real AI engines — an Opportunity
Recommender, an AI Team Builder, and an Originality Checker — over seeded
demo data. Nothing is mocked: every score, match, and recommendation on
screen is computed by the backend at request time.

## 1. Overview

Students discover opportunities without regard to their actual skill level,
form teams through friend circles instead of complementary skills, and often
learn an idea has already been done only after investing real time in it.
NIRMAAN ranks opportunities by profile fit, suggests skill-complementary
teammates via a weighted graph, and screens submitted ideas against a prior
corpus before the student commits — all from one dashboard.

## 2. Architecture

```
React + TS frontend  --REST-->  FastAPI backend  --ORM-->  SQLite/Postgres
(Vite, Tailwind,                (JWT auth, /api/*)          (students, opportunities,
 TanStack Query)                       |                     ideas, reviews)
                          -------------+-------------
                          |            |            |
                 TF-IDF recommender  networkx graph  Sentence-BERT/TF-IDF
                 (cosine similarity) (Neo4j-ready)    + FAISS/cosine similarity
```

Frontend and backend are decoupled over a versioned REST contract
(`/api/...`). The frontend never talks to the database directly.

## 3. Features

- JWT authentication (register/login), bcrypt password hashing, role-based
  access (STUDENT / REVIEWER)
- 6-step onboarding wizard with interactive skill/interest chip selection
- Dashboard with real backend-derived metrics (no fabricated numbers)
- Opportunity discovery: search, domain filter, sort, server-computed
  deadline urgency, pagination
- Opportunity detail with a profile-comparison "why this matches you" breakdown
- AI Team Builder: interactive skill selection, live coverage chart
- Originality Checker: novelty score, closest matches, human-in-the-loop
  review routing for high-similarity ideas
- Reviewer console: queue, evidence view, confirm/dismiss/needs-review
  decisions with confirmation dialogs
- Light/dark/system theme, responsive down to 360px, toasts, skeletons,
  empty states, centralized error handling

## 4. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, React Hook Form + Zod, Recharts, Framer Motion, Lucide |
| Backend | FastAPI, SQLAlchemy, Pydantic, python-jose (JWT), bcrypt |
| Database | SQLite (dev default) / PostgreSQL (via `DATABASE_URL`) |
| Team graph | networkx in-memory graph (dev default) / Neo4j-ready adapter point |
| Originality | Sentence-BERT (`all-MiniLM-L6-v2`) when available, TF-IDF fallback otherwise; FAISS dependency present for vector search |
| Infra | Docker, Docker Compose, GitHub Actions |
| Testing | Pytest (backend), Vitest + Testing Library (frontend unit), Playwright (frontend E2E — spec files included) |

## 5. Frontend setup

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api and /health to :8000
```

## 6. Backend setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env      # edit as needed
python3 -m uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs (OpenAPI/Swagger, auto-generated).
Demo data seeds automatically on first run against an empty database.

## 7. Database setup

Defaults to a local SQLite file (`nirmaan.db`) — zero setup. To use
PostgreSQL, set in `.env`:
```
DATABASE_URL=postgresql://nirmaan:nirmaan@localhost:5432/nirmaan
```
No code changes are needed — SQLAlchemy abstracts the dialect, and
`psycopg2-binary` is already in `requirements.txt`.

## 8. Neo4j setup (optional)

The Team Builder works out of the box with an in-memory `networkx` graph
(`backend/app/engines/team_builder.py`) — this is a deliberate development
fallback, not a placeholder pretending to be the real thing. To use real
Neo4j: start it via `docker compose --profile graph up neo4j`, set
`NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` in `.env`, and implement a
Neo4j-backed adapter behind the same `build_team()` signature.

## 9. FAISS / model setup

`faiss-cpu` is installed and imports successfully. The Originality Checker
tries to load `sentence-transformers` (`all-MiniLM-L6-v2`) first; since this
sandbox has no route to huggingface.co, it automatically falls back to
TF-IDF vectors so the pipeline still runs end-to-end. On a machine with
internet: `pip install sentence-transformers` and nothing else changes —
check the `embeddingMode` field in `/api/idea/check` responses or `/health`
to see which mode is active at runtime.

## 10. Environment variables

See `backend/.env.example` for the full list (`DATABASE_URL`, `JWT_SECRET`,
`CORS_ORIGINS`, `NEO4J_URI`, `MODEL_NAME`, `FAISS_INDEX_PATH`). Notably,
`CORS_ORIGINS` now defaults to `*` only for local dev and logs a warning —
set it explicitly to your real frontend origin(s) before deploying.

## 11. Seed data

51 opportunities, 31 students, 50 prior ideas — realistic names and
organizations, deadlines computed relative to "today" so the demo never
looks stale. See `backend/app/seed_data.py`. Seeding is idempotent (skipped
if opportunities already exist).

Demo logins:
- Student: `priya.nair@gla.demo` / `demo1234`
- Reviewer: `reviewer@gla.demo` / `demo1234`

## 12. Run commands

```bash
# backend
cd backend && python3 -m uvicorn app.main:app --reload --port 8000

# frontend (separate terminal)
cd frontend && npm run dev
```

## 13. Testing

```bash
# Backend — 17 tests covering auth, profile, recommender, team builder,
# originality + reviewer workflow, and authorization
cd backend && python3 -m pytest tests/ -v

# Frontend — 10 unit/component tests (Vitest + Testing Library)
cd frontend && npm test

# Frontend — Playwright E2E specs are written (e2e/*.spec.ts, covering
# register->onboarding->dashboard, login/logout, recommendations, opportunity
# detail, team builder, originality checker, history, reviewer decisions)
# but NOT executable in this sandbox: `npx playwright install` needs
# cdn.playwright.dev, which isn't reachable here. Run on a machine with
# internet: cd frontend && npx playwright install chromium && npm run test:e2e
```
Also included: `backend/smoke_test.py`, a plain-Python end-to-end check with
no test framework dependency, useful for a quick sanity check during a viva.

## 14. Docker

```bash
docker compose up --build          # postgres + backend + frontend
docker compose --profile graph up  # adds a real Neo4j container
```
**Honest caveat:** this sandbox has no Docker daemon, so `docker build`
itself has not been run here — the Dockerfiles and compose file follow
standard, widely-used patterns (multi-stage Node build -> nginx for the
frontend; slim Python image for the backend; Postgres health-checked before
the backend starts) but verify them on your own machine before relying on
them for a live demo.

## 15. Deployment

Frontend: any static host behind `frontend/Dockerfile` (or plain
`npm run build` + serve `dist/`) — e.g. Vercel-style. Backend: any container
host — e.g. Render-style — pointed at a managed Postgres instance, with
`CORS_ORIGINS` set to the deployed frontend URL and `JWT_SECRET` set to a
real secret.

## 16. API documentation

FastAPI auto-generates OpenAPI/Swagger docs at `/docs` and `/redoc` once the
backend is running. Every route already has request/response models via
Pydantic; endpoint-level descriptions are a good next incremental pass.

## 17. Evaluation methodology (per the project synopsis)

- **Recommender** — Precision@10 / NDCG@10 against a recency-sorted
  baseline. Not yet computed against a held-out labelled set (needs the
  ~50-100 labelled student-opportunity relevance judgements the synopsis
  calls for).
- **Team Builder** — skill-diversity score of suggested teams vs. randomly
  formed teams of the same size (the `diversityScore` field already
  returned by `/api/team/suggest` is exactly this signal; a batch comparison
  script against random sampling is the remaining step).
- **Originality Checker** — Precision/Recall/F1 against a keyword-overlap
  baseline on manually labelled similar/dissimilar idea pairs. The threshold
  logic (`HIGH_SIMILARITY_THRESHOLD = 0.55`) is implemented and documented
  in `backend/app/engines/originality.py`; formal benchmark scoring is not
  yet automated.

## 18. Troubleshooting

- **CORS errors in the browser console** — set `CORS_ORIGINS` in the
  backend `.env` to include your frontend's exact origin.
- **401 immediately after login** — check `JWT_SECRET` matches between
  requests (it's read once at process start; restarting the backend
  invalidates previously issued tokens if the secret changed).
- **`embeddingMode` shows `tfidf-fallback`** — expected without internet
  access to huggingface.co; not a bug.
- **Empty dashboard** — the seeded student pool has profiles; a freshly
  registered account starts with an empty profile by design — complete
  onboarding first.

## 19. What's still genuinely open

- Neo4j adapter is a documented swap point, not implemented against a real
  Neo4j instance.
- Sentence-BERT/FAISS path is implemented but unverified without internet
  access in this environment.
- Docker images are written but unbuilt/unverified here (no Docker daemon
  available in this sandbox).
- Playwright specs are written but unexecuted here (browser download
  blocked); Vitest (frontend) and Pytest (backend) suites are both green.
- Evaluation scripts (Precision@10/NDCG, diversity-vs-random benchmark,
  Originality P/R/F1) are designed but not yet automated as standalone
  reports.

## 20. Phase 5 — opportunity platform features (new)

Added on top of everything above, all real and backend-persisted (never
localStorage for server-owned state), all covered by new tests:

- **Saved opportunities** — `POST/DELETE /api/opportunities/{id}/save`,
  `/saved` page. Server-owned, ownership-scoped.
- **Application tracker** — `/api/applications` with a 10-stage pipeline
  (wishlist → ... → selected/rejected/withdrawn), a real per-application
  activity log, and a Kanban board + list view at `/applications`.
- **Notifications** — `/api/notifications`, real unread badge in the top
  bar, created synchronously when something notification-worthy actually
  happens (e.g. an idea gets flagged for review) — see the honest
  limitation below.
- **Activity stream** — `/api/activity` and `/activity`, logging genuine
  events (saved, applied, team built, idea checked, profile updated) —
  never fabricated.
- **Organizations** — `/api/organizations`, derived live from the real
  `Opportunity.organization` field. No separate CMS model, no invented
  logos/stats/verification badges.
- **Saved searches ("alert me when...")** — full CRUD via
  `/api/saved-searches`. **Honest limitation:** there is no background
  scheduler that evaluates these against new opportunities and fires a
  notification — that needs a job runner (APScheduler/Celery
  beat/cron) that doesn't exist yet. The data model and CRUD API are real;
  the "alerting" itself is not wired up.

**Also not done from the Phase 5 spec:** opportunity comparison, "why not
this" skill-gap explanations, personalized/behavior-based ranking (view/save
signal collection), the extensible multi-category opportunity taxonomy (14+
categories with rich metadata), and organization pages beyond the basic
derived list — all would need real product-scoping decisions rather than
being safely improvised.

## 21. Phase 6 — opportunity model depth, discovery, comparison

- **Real category/participation/trust classification** — `Opportunity` now
  has `category` (Hackathon/Internship/Competition/...), `participation`
  (individual/team), `minTeamSize`/`maxTeamSize`, and `sourceType`
  (official/aggregator). All four are *derived deterministically* from the
  opportunity's own title and source text (see
  `backend/app/opportunity_classify.py`) — nothing is invented; a hackathon
  gets `team, 2-4` because that's a reasonable default for that category,
  not a fabricated headcount.
- **Advanced filters with URL persistence** — Opportunities page filters
  (search, category, domain, sort) now live in the URL query string, so
  filtered views are shareable/bookmarkable.
- **Opportunity comparison** — select 2-4 opportunities on the Opportunities
  page and compare them side by side at `/compare`; the "strongest match"
  callout is computed from real fit scores and deadlines in the comparison
  set, not a canned line.
- **Organizations hub** — `/organizations` and `/organizations/:name` (the
  Phase 5 backend for this existed with no frontend until now). Only real
  fields are shown; the page explicitly states that logo/description/website
  aren't available rather than inventing placeholders.
- **Smart Alerts page** — frontend for the Phase 5 `saved-searches` backend,
  with the scheduler limitation stated directly in the UI itself, not just
  buried in docs.

**Not done from this round's spec** (55 parts — same honesty as every phase):
Why/Why-Not explainability engine, behavioral/personalization ranking beyond
content-based matching, NIRMAAN Insight engine, My Ideas workspace,
application analytics, deduplication pipeline, Precision@K/NDCG evaluation
harness, full E2E test matrix, admin/observability tooling. These need real
product-scoping and, in several cases (evaluation, personalization),
labelled data this project doesn't have yet.

## 22. Phase 7 — intelligence layer, cross-engine integration

Four new real engines, all evidence-based (never generic fallback text):

- **Next Best Action** (`engines/next_best_action.py`) — checks real state
  (incomplete profile, closing-soon high-fit recs, stalled applications,
  saved-but-untracked opportunities, unchecked ideas) in priority order and
  returns one action with real evidence. Shown as the dashboard hero card.
- **Why-Not** (`engines/why_not.py`) — for any opportunity, explains real
  blockers (missing skills, experience/availability/domain mismatch) using
  only stored profile/opportunity fields. Shown on Opportunity Detail when
  fit < 50%, and only if it actually found a blocker.
- **Skill Gap Map** (`engines/skill_gaps.py`) — aggregates real
  `missingSkills` across a student's actual recommendations into "skill X
  would unlock N opportunities." No invented proficiency percentages.
- **Application Intelligence** (`engines/application_intelligence.py`) —
  flags genuinely stalled (real `updated_at` age) or genuinely urgent (real
  linked-opportunity deadline) applications.
- **Real Smart Alert evaluation** — `POST /api/saved-searches/{id}/evaluate`
  runs the alert's filters against current real recommendations and returns
  real matches, right now, on demand. The Smart Alerts page has a working
  "Check now" button wired to this. This remains the honest substitute for
  a background scheduler, which still doesn't exist in this environment.
- **Deep opportunity→Team/Originality integration** — the "Build team for
  this" and "Validate idea for this" links on Opportunity Detail now pass
  the opportunity's real required skills, team size, and domain as query
  params; Team Builder and Originality Checker read them, pre-fill the
  form, and show a context banner naming the source opportunity.

**Not attempted from this round's 60-part spec:** the formal
`IntelligenceService` abstraction layer (the four engines above exist as
plain modules, not a unified service class), behavioral/interaction-based
personalization (would need real usage data this project doesn't have),
opportunity ingestion/deduplication pipeline (no live external source to
ingest from — building this would be pure scaffolding), My Ideas workspace,
reviewer workflow upgrades, AI evaluation harness (Precision@K/NDCG/F1 need
a labelled dataset that doesn't exist), and the full 23-page visual QA pass.

## 23. Phase 8 — Google OAuth, resume upload, calendar export, real gap-fixes

- **Google OAuth login** — real Authorization Code flow
  (`app/google_oauth.py`, `routers/google_auth.py`). Set `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `.env` to enable it —
  without them, `GET /api/auth/google/status` returns
  `{"configured": false}` and the frontend cleanly disables the "Continue
  with Google" button instead of showing something broken. Identity is
  confirmed via Google's own `userinfo` endpoint (server-validates the
  token); full local ID-token signature verification via `google-auth` is
  the more defense-in-depth alternative, not implemented here to avoid an
  extra dependency — stated in the module docstring, not hidden.
- **Google Calendar connection** — separate, optional consent from login
  (`routers/calendar.py`, `GoogleAccount` model). Also gracefully disabled
  without credentials.
- **Real `.ics` calendar export** — works today, no OAuth needed at all:
  `GET /api/opportunities/{id}/calendar.ics` returns a real iCalendar file
  any calendar app can import. This is the primary "add to calendar" path;
  the OAuth-based direct-to-Google-Calendar event creation is a real but
  optional upgrade on top of it.
- **Gmail provider interface** (`app/providers/gmail.py`) — built honestly
  minimal. NIRMAAN sends no email anywhere in the product yet, so this is
  architecture with no consumer, and the module docstring says so plainly
  rather than implying a working integration.
- **Real resume upload** (`app/resume_parser.py`, `routers/resume.py`) —
  PDF (pdfplumber) and DOCX (python-docx) text extraction, then
  regex/keyword-based detection of name, email, skills (matched against the
  same controlled vocabulary the recommender uses), GitHub, and LinkedIn.
  Explicitly labelled `"method": "heuristic-keyword-match"` in the API
  response — not an LLM, not a trained model. Extracted data is always
  shown for confirmation; nothing is written to the profile until the
  student confirms, and existing skills are never removed.
- **Real gap fixed**: Originality History had no delete or detail endpoint
  at all before this phase — added both, ownership-scoped, with a
  confirmation dialog on the frontend.
- **Two real bugs caught by the test suite this round**: a lost
  `@router.get("/history")` decorator that silently broke
  `GET /api/idea/history` entirely, and a false-positive skill match
  ("git" matching inside "github.com" via substring search) — fixed with
  word-boundary regex.

---
NIRMAAN — GLA University B.Tech CSE (AI/ML) mini-project · Team Code Blooded
(T-102) · Shaurya Singhal, Tahaseen Khan, Vedika Agarwal · Mentor: Miss
Chhavi Bajpai.

`legacy-frontend/` is the original Phase 1 plain HTML/JS dashboard, kept only
for reference — the real, current frontend is `frontend/`.
