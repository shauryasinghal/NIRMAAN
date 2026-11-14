# Feature matrix

Legend — **✓** built and verified · **◐** built, verified only partly (reason given) · **—** not applicable.
"Verified" means covered by an automated test that runs against a real Postgres (and, for E2E, the real API + browser).

| Feature | Status | Frontend | Backend | Database | AI | Auth | Tests | E2E | Security |
|---|---|---|---|---|---|---|---|---|---|
| Email sign-up / login / verify / reset / logout | ✓ | ✓ | ✓ (verify only) | ✓ trigger | — | ✓ Supabase | ✓ | ✓ (stand-in auth) | ✓ |
| Google OAuth | ◐ | ✓ button enabled only if Supabase reports the provider | ✓ config probe | — | — | ◐ | ✓ | ◐ redirect + error path; **no real Google round trip** | ✓ PKCE, no passwords |
| Role security (student/reviewer/admin) | ✓ | ✓ | ✓ | ✓ trigger + audited RPC | — | ✓ | ✓ | ✓ | ✓ 49 DB + API + E2E checks |
| Onboarding | ✓ | ✓ 5 steps | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Profile (confirmed vs inferred skills, evidence, items, links) | ✓ | ✓ | ✓ | ✓ | ✓ inferred≠confirmed | ✓ | ✓ | ✓ | ✓ |
| Resume upload (PDF/DOCX → review → confirm) | ✓ | ✓ | ✓ rule-based, labelled as such | ✓ | — | ✓ | ✓ 8 | ✓ | ✓ hardened uploads |
| Opportunity discovery, search, 14 filters, facets, sort, pagination, URL state | ✓ | ✓ | ✓ server-side SQL | ✓ trgm/tsvector/GIN | — | ✓ | ✓ | ✓ | ✓ injection-safe |
| Recommendation (8 signals, components, matched/missing, reasons, concerns) | ✓ | ✓ | ✓ | ✓ | ✓ deterministic | ✓ | ✓ | ✓ | ✓ |
| Why this / Why not (blockers with counterfactual impact) | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Behavioural personalisation (visible, resettable) | ✓ | ✓ | ✓ 11 event types | ✓ `user_events` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Next Best Action | ✓ | ✓ | ✓ evidenced, priority-ranked | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Skill intelligence (gap → opportunities → team role → action) | ✓ | ✓ | ✓ counterfactual re-scoring | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Saved opportunities, Compare (2–4) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ IDOR |
| Applications + real timeline (10 statuses) | ✓ | ✓ board/list/dialog | ✓ | ✓ trigger-written events | — | ✓ | ✓ | ✓ | ✓ IDOR |
| Smart alerts (criteria, evaluator, hits, manual evaluate, scheduler) | ✓ | ✓ | ✓ | ✓ | ✓ fit-gated | ✓ | ✓ | ✓ | ✓ IDOR |
| Notifications (unread/read/all, preferences, dedupe) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ IDOR |
| Organizations (derived from real listings only) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Team Builder (from opportunity requirements, consent-gated, explained) | ✓ | ✓ | ✓ | ✓ | ✓ 97 % vs 69 % random | ✓ | ✓ | ✓ two-account invite/accept | ✓ opt-in only |
| Team diversity (skills/roles/complementarity/redundancy; no demographics) | ✓ | ✓ formula shown | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ideas / Originality (MiniLM 384-d + pgvector cosine) | ✓ | ✓ | ✓ | ✓ HNSW | ✓ calibrated, baseline-compared | ✓ | ✓ real model | ✓ real model | ✓ |
| Originality: Gemini deep analysis (structured input → MiniLM/pgvector retrieval → schema-constrained Gemini report → suggestions) | ✓ opt-in (`ORIGINALITY_AI_ENABLED`) | ✓ 3-stage progress, side-by-side, measured vs AI labelled | ✓ owner-only endpoint, no DB held during the call | ✓ `analysis.ai` jsonb (no migration) | ✓ qualitative only; never a score; failure reported as unavailable | ✓ | ✓ 57 (mocked Gemini, real MiniLM + pgvector) | — (no real Gemini in CI) | ✓ key backend-only, prompt hardening, peers never sent, rate-limited |
| "FAISS" | replaced | — | pgvector instead (FAISS removed on purpose) | ✓ | — | — | — | — | — |
| Reviewer workflow (approve / request changes / escalate / reject + audit) | ✓ | ✓ | ✓ | ✓ immutable | — | ✓ | ✓ | ✓ | ✓ |
| Admin (roles, audit, ingestion runs) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Dashboard (all numbers from the DB) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Activity + "what shapes my recommendations" | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Settings (theme, notification prefs, connections, privacy reset) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Live opportunity ingestion framework (adapters, robots/rate-limit, dedupe, verify) | ◐ | ✓ admin view | ✓ | ✓ | ✓ semantic dedupe | — | ✓ mocked transports | — | ✓ opt-in sources |
| Real external sources | ✗ none enabled | — | registry ready | — | — | — | — | — | — |
| Google Calendar / Gmail (optional) | ◐ | ✓ | ✓ minimal scopes, bound state, encrypted tokens | ✓ | — | — | ✓ mocked Google | — | ✓ explicit confirm |
| `.ics` calendar export | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| Health / readiness / structured logs / error contract | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ redaction |
| Accessibility (WCAG 2 A/AA via axe, keyboard, focus, reduced motion) | ✓ | ✓ 0 critical/serious on 24 checks incl. dark + dialogs | — | — | — | — | ✓ | ✓ | — |
| Responsive (320–1920 px) | ✓ | ✓ 123 checks, no horizontal overflow | — | — | — | — | — | ✓ | — |
| Production build, CSP | ✓ | ✓ entry chunk 37 kB, vendors split | — | — | — | — | — | ✓ 0 CSP violations | ✓ |
| Deployment (Vercel + Render + Supabase) | ◐ | ✓ config | ✓ config | ✓ 21 migrations applied (checked 2026-10-01) | — | — | ✓ CI green on main `8c13922` (2026-10-01) | — | ◐ deployment not verified |

## Explicit gaps
- Hosted Supabase: 21 migrations applied (last checked 2026-10-01); deployment to Vercel/Render is not verified.
- Hosted Supabase reports Google sign-in enabled and the authorize flow reached Google’s sign-in page, but a complete real sign-in callback/session has not been verified. Calendar/Gmail connections remain unconfigured.
- Hosted catalog currently contains 64 demo opportunities, 28 demo organizations and 50 reference ideas (seeded 2026-10-01). No real external opportunity source is enabled; listings are labelled demo data.
- Docker images and docker-compose have not been built locally. GitHub Actions passed on `main` commit `8c13922` on 2026-10-01.
- The recommender's quality numbers are a consistency check on synthetic labels; real relevance needs real usage data (docs/EVALUATION.md).
