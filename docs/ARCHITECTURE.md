# Architecture

## Request path

```
React (Vite)  ──JWT──▶  FastAPI  ──RLS-scoped connection──▶  Supabase Postgres
  supabase-js                │                                  ├ auth.users → trigger → public.profiles (role = student)
  (auth, session)            ├ engines (pure functions)         ├ RLS on every table, private.* SECURITY DEFINER helpers
                             ├ MiniLM (loaded once, lazy)       ├ pgvector HNSW (idea + opportunity embeddings, 384-d)
                             └ jobs (alerts, ingest, sql)       └ pg_cron (reminders, freshness)
```

- `app/core` — settings (fail-fast in production), structured logging with redaction, one error contract, JWT verification, middleware (request id, security headers, rate limits).
- `app/db/session.py` — one transaction per request; `SET LOCAL role` + `request.jwt.claims`; `db.service()` for explicit elevation.
- `app/engines` — **pure, deterministic** functions: `recommender` (8 signals, unknown inputs excluded), `why_not` (blockers with counterfactual impact), `next_best_action`, `skill_intelligence`, `team_builder`, `originality` (decision logic + embedder). No DB, no clock, no globals — hence testable and reproducible.
- `app/services` — SQL + orchestration per domain (catalog search/facets, applications, alerts, teams, ideas, dashboard …).
- `app/routers` — thin FastAPI routers with Pydantic request/response models (camelCase on the wire).
- `app/ingestion` — `OpportunitySource → fetch → normalise → validate → classify → dedupe → verify → store → index`; sources registered in `registry.py`; `PoliteFetcher` enforces robots.txt, rate limits, size caps.
- `app/jobs` — `sql` (reminders/freshness), `alerts` (evaluate new/updated opportunities), `ingest`; run by cron, `POST /api/internal/jobs/{name}` (secret header), or `python -m app.jobs`; guarded by a Postgres advisory lock.

## Data model highlights

Identity (`profiles`, `skills`, `interests`, `profile_skills` with `status confirmed|inferred` + `skill_evidence`) · catalog (`opportunities` with unknown = NULL,
`opportunity_skills` required/preferred, `opportunity_sources`, `ingestion_runs`, `opportunity_source_links`, `opportunity_embeddings`) · activity (`applications` + trigger-written `application_events`,
`saved_opportunities`, `saved_searches` + `saved_search_hits`, `user_events`, `notifications` + `notification_preferences`) · teams (`teams`, `team_memberships` with invitation state) ·
AI (`ideas`, `idea_embeddings vector(384)`, `idea_matches` with overlap dimensions, `reviews`, `review_decisions`) · system (`audit_log`, `oauth_connections`).
Migrations live in `supabase/migrations/`; the first eight are a reconstruction of what was already applied to the hosted project (see docs/DEPLOYMENT.md for how equivalence was verified).

## Frontend

Routes are lazy-loaded; server state is TanStack Query; the URL is the source of truth for discovery filters (with an optimistic local copy). Guards are UX only — the API re-checks roles on every call.
One design system (tokens in `styles/index.css`, WCAG-AA text colours, `dark:` follows the in-app theme), one accessible `Dialog` (focus trap/restore), skeleton/empty/error states on every data screen, `prefers-reduced-motion` respected.
