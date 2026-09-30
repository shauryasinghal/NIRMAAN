# NIRMAAN — Repository Audit (2026-09-30)

Baseline: commit `8df7e47`. Backend 50/50 pytest green, frontend `tsc -b` clean, 10/10 vitest, `vite build` OK,
Playwright specs present but never executed. Remote Supabase project `nirmaan` (`kfdkesxvyugmwrutepjm`, ap-south-1) inspected read-only.

## Headline finding

The repo and the Supabase project are two different systems that were never joined.

| | Repo (`backend/`, `frontend/`) | Supabase project `nirmaan` |
|---|---|---|
| Database | SQLite via SQLAlchemy, string PKs, JSON columns | Postgres 17: 26 tables, uuid PKs, enums, CHECKs, RLS on every table, HNSW index, pg_trgm, pg_cron |
| Auth | Custom bcrypt + self-signed HS256 JWT | Supabase Auth (3 real users, email provider only) |
| Migrations | **None in the repo** | 8 applied (`nirmaan_schema` … `nirmaan_login_profiles_compat`) — not reproducible from git |
| Roles | `STUDENT`/`REVIEWER`, client-selectable | `student/reviewer/admin`, guarded by trigger, audited `admin_set_role()` |

## Critical blockers (P0)

1. **Privilege escalation** — `POST /api/auth/register` accepts `role: "REVIEWER"` from the client (`schemas.RegisterIn`, `routers/auth.py`). Anyone can self-promote to reviewer.
2. **Forgeable tokens by default** — `JWT_SECRET` silently defaults to `dev-secret-change-in-production` (`security.py`); the app boots with it in any environment.
3. **Google OAuth account takeover** — callback links an existing account by email without checking `email_verified`; `state` is a signed blob not bound to the browser (login CSRF). It is also a second auth system parallel to Supabase Auth.
4. **Not reproducible from zero** — no migration files; the remote schema exists only inside the hosted project.
5. **Backend does not use the database it is meant to use** — Supabase Postgres / RLS / pgvector are unused by the app.
6. **Team Builder leaks other students** — candidates are *every* student (names + skills) with no consent flag; the remote schema already has `profiles.open_to_team` for this.
7. **No role hierarchy / audit** — no admin; reviewer decisions write no audit row; no escalate/reject/request-changes.

## Architecture / API

- No global error contract: `HTTPException.detail` is sometimes a string, sometimes `{code,message}`; no handlers for validation/500.
- CORS defaults to `*`; no rate limiting; `/health` leaks raw DB exception strings; no `/ready`.
- No response schemas on most routes (raw dicts), no pagination envelope consistency, list endpoints fetch **all rows then filter/paginate in Python** (`routers/opportunities.py`).
- `models.Base.metadata.create_all` + seeding run at import time.

## AI engines

- **Recommender**: single TF-IDF cosine refit over the whole catalog per request; not the 8 required signals; no component scores, no concerns, no behavioural signal; `/recommend` writes a log row per item per GET.
- **Why-Not** exists but only 4 blocker kinds; no eligibility/team-size/location/deadline blockers (fields don't exist in the schema).
- **Originality**: TF-IDF fallback is *not semantic* and is refit per request; FAISS index rebuilt from the full corpus per request (embeds N docs per call); no pgvector; empty corpus returns `noveltyScore: 100`; UI copy/score framing implies "100% original".
- **Team Builder**: greedy over a networkx graph that is built but never used for selection; not tied to an opportunity; no role assignment; diversity score = mean pairwise complementarity (not explained).
- **NBA / skill gaps**: real but skills are flat string arrays — no evidence/source/confidence, inferred vs confirmed not distinguishable.
- No behavioural event capture except saved/applied recommendation events (remote) — none in repo.

## Data model gaps vs. the brief (remote schema)

Opportunities lack: subcategory, tags, preferred skills, eligibility, education/experience reqs, location, work_mode, prize/stipend/salary, certificate, registration/event dates, canonical URL, verification_status, last_verified/seen, freshness. No ingestion/source/dedupe tables. `saved_searches` lacks category/location/type/deadline-window. Teams not linked to opportunities, no roles. `profile_skills` has no source/confidence. No notification preferences, no team-event/smart-alert notification kinds, no `user_events`, no OAuth-connection table. `idea_embeddings` and `saved_search_hits` have RLS enabled with **no policies**. Supabase advisor: leaked-password protection disabled.

## Frontend

- Custom `AuthContext` with JWT in `localStorage`; no email verification, password reset, refresh, or session listener.
- `/onboarding` is not route-protected; no 404 route; role stored client-side in `localStorage` (only cosmetic, but drives guards).
- Opportunities page has 4 filters; brief requires ~14, chips, counts, URL persistence for all.
- 10 unit tests; Playwright specs never run; no accessibility/responsive verification recorded.
- Runtime click-through QA not yet done (scheduled after P0/P1 so it is not wasted on screens about to change).

## Resume upload

Content-Type is trusted from the client (no magic-byte check); full body read before the size check; DOCX zip-bomb not bounded; extracts name/email/skills/links only (no education/projects/certs/experience/achievements).

## Testing / deployment

- No RLS/IDOR/JWT tests (auth tests only cover happy path); no API contract tests; CI does not lint or run e2e.
- No `vercel.json` (SPA rewrites), docker-compose ships default secrets, requirements partially unpinned, backend image builds ML deps unconditionally.
- No secrets found in source (grep for keys/tokens/private keys clean); no git history existed (repo initialised at the audit checkpoint).

## Implementation plan

**P0 — blocking**
1. Migrations: reconstruct the 8 remote migrations into `supabase/migrations/`, add new additive ones, prove `fresh DB → migrate → seed → RLS tests` in one script.
2. Backend data layer onto Supabase Postgres; verify Supabase JWTs (JWKS / HS256); `get_current_user`, `require_student/reviewer/admin`; RLS-scoped sessions by default, explicit service session for system writes.
3. Remove client-chosen roles; error contract; CORS; rate limit; structured logs; `/health` + `/ready`.
4. Frontend on `supabase-js` (signup, login, verify, reset, logout, Google, session persistence).

**P1 — important**
5. Opportunity schema + search/filters (server-side), ingestion adapters + dedupe + fixtures.
6. Recommender (8 signals, components, matched/missing, reasons, concerns), Why / Why-Not, behavioural events, NBA, skill intelligence.
7. Team Builder from opportunity (+ consent gate), diversity as coverage/complementarity/redundancy.
8. Originality on pgvector 384-d MiniLM, correct wording, reviewer workflow + audit.
9. Applications, alerts evaluator + scheduler + manual command, notifications + preferences, resume v2, optional Google Calendar/Gmail.
10. Dashboard from DB only.

**P2 — polish**
11. Design-system pass, motion (+reduced motion), responsive (8 widths), a11y, perf.
12. Tests: pytest (RLS/IDOR/JWT/upload/contracts), vitest, Playwright critical flows.
13. README, `.env.example`, Vercel + backend host config; deployment claims only when verified.
