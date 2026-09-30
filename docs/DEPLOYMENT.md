# Deployment guide

**Status: written and dry-run offline; nothing has been deployed and the hosted database has not been modified.**
Do the steps in order. Every secret goes in the host's secret manager or a git-ignored `.env` — never in source.

## 1. Supabase (database + auth)

Project `nirmaan` (`kfdkesxvyugmwrutepjm`, ap-south-1) already exists with the first 8 migrations applied and 3 user accounts.

**Before applying anything** (all already verified locally — rerun if migrations change):

```bash
supabase/tests/run.sh            # fresh DB → all migrations → 49 security checks
supabase/tests/upgrade_test.sh   # hosted project's current state + real-looking data → new migrations → nothing lost
```

Catalog fingerprint comparison (read-only) showed my reconstruction of the 8 already-applied migrations matches the
hosted schema exactly (columns, constraints, indexes, private functions, enums) with one cosmetic policy difference,
`activities_insert`, normalised by the first new migration.

**Apply the 13 new migrations** (`20260930090000` … `20260930091200`), in order — either
`supabase db push` (CLI, project linked) or the MCP `apply_migration` tool, one file at a time. All are additive;
none drops or truncates data. `20260930090800` relaxes two NOT NULL defaults; `20260930090000` normalises one policy.
Afterwards run the Supabase advisors and confirm: RLS enabled on every table, no `rls_enabled_no_policy` findings.

**Migration history.** The hosted project's 13 migrations were applied on 2026-09-30 through the MCP `apply_migration` tool, which stamps each with the
*current time* instead of the filename version. That history was then reconciled with the supported CLI mechanism so `supabase db push` sees nothing pending:
`supabase migration repair --status applied <the 13 filename versions>` followed by `--status reverted <the 13 stamped versions>`, then `supabase db push --dry-run`
→ *"Remote database is up to date."* (`repair` edits only `supabase_migrations.schema_migrations`; it runs no SQL.) Prefer `supabase db push` for future migrations so the
versions match the files from the start.

**Dashboard settings (cannot be done from code):**

| Setting | Where | Value |
|---|---|---|
| Site URL | Authentication → URL Configuration | your production frontend URL |
| Redirect URLs | same | `https://YOUR-APP/auth/callback`, `https://YOUR-APP/auth/reset` (+ `http://localhost:5173/...` for dev) |
| Email confirmations | Authentication → Providers → Email | **on** |
| Leaked-password protection | Authentication → Policies | **on — requires the Pro plan or above.** The hosted project is on the Free plan, so the advisor keeps flagging it (accepted limitation until upgraded) |
| Password minimum length / required characters | Authentication → Sign In / Providers → Email | ≥ 10 and the strictest character requirement (available on Free; partly compensates for the missing leaked-password check) |
| Custom SMTP | Authentication → SMTP | recommended for production volume |

**First administrator.** Public signups are always students. Promote the first admin once, as the database owner (SQL editor):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';   -- allowed for postgres/service_role only
```
Thereafter role changes go through the Admin page (`private.admin_set_role`: admin-only, audited, never removes the last admin).

**Scheduled jobs.** `pg_cron` already runs `private.run_scheduled_sql_jobs()` every 30 min (deadline/application/profile
reminders + freshness). Alert evaluation runs in the API (see §3).

## 2. Google sign-in (Supabase provider)

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID (Web application)**.
2. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (exactly).
3. Supabase → Authentication → Providers → Google: paste the client ID and secret, enable.
4. Nothing to set in the frontend or API: the login page asks Supabase (`/auth/v1/settings`) whether Google is enabled and
   **disables the button when it isn't**. NIRMAAN never sees a Google password (Google's consent screen + PKCE).

The variables `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` in the API are for the **optional Calendar/Gmail connections only**
(a separate consent, minimum scopes `calendar.events` and `gmail.send`). They also need `TOKEN_ENCRYPTION_KEY`
(`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`). Set
`GOOGLE_REDIRECT_URI=https://YOUR-APP/integrations/google/callback` and register it in the Google client too.

## 3. API host (Render blueprint provided; any container host works)

`render.yaml` defines the web service (Docker), a health check on `/health`, and a 15-minute cron running `python -m app.jobs alerts`.

| Variable | Value |
|---|---|
| `NIRMAAN_ENV` | `production` (the process **refuses to start** with missing DB/auth config or a wildcard CORS) |
| `DATABASE_URL` | Supabase → Database → Connection string, **pooler** (port 6543) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` — enables JWKS verification (asymmetric keys). Legacy HS256 projects also set `SUPABASE_JWT_SECRET`. |
| `SUPABASE_ANON_KEY` | the **publishable** key (public; never `service_role`). Hosted Supabase answers 401 to `/auth/v1/settings` without an `apikey` header, so without it `/api/auth/config` reports `verified:false` and Google sign-in stays disabled. |
| `CORS_ORIGINS` | the production frontend origin(s), comma-separated |
| `FRONTEND_URL` | the frontend URL |
| `CRON_SECRET` | long random string (for `POST /api/internal/jobs/{sql,alerts,ingest}` with `X-Cron-Secret`) |
| `PRELOAD_EMBEDDING_MODEL` | `true` (loads MiniLM at startup; the weights are baked into the image) |

Health: `GET /health` (liveness, no dependencies) and `GET /ready` (database, pgvector, schema, auth config — no secrets in the output).
The API runs behind one process-local rate limiter; for more than one instance swap `SlidingWindowLimiter` for Redis.
`SESSION_CACHE_SECONDS` (default 10) is the worst-case delay before a sign-out invalidates an access token.

**Token verification troubleshooting.** A genuine Supabase token is verified against the project's JWKS (`/auth/v1/.well-known/jwks.json`, ES256).
- `401 "Invalid or expired token"` → the token itself failed (signature, issuer, audience, expiry). The log line `auth_token_rejected` carries the PyJWT error *class* in `code` (e.g. `InvalidAudienceError`) — never the token.
- `503 service_unavailable` ("Sign-in verification is temporarily unavailable") + log `auth_jwks_unavailable` → the API could not fetch the signing keys (network or TLS trust). It still fails closed, but it is an outage, not a bad token, so clients do not refresh/retry or sign the user out.
- The JWKS download uses `certifi`'s CA bundle (as `httpx` does), not the OS store: python.org's macOS Python has no default store and used to fail with `CERTIFICATE_VERIFY_FAILED`, rejecting every real Google/email session. Regression: `backend/tests/api/test_oauth_token_verification.py` (real TLS handshake against a local JWKS server).

## 4. Frontend (Vercel)

1. Import the repo, **root directory `frontend`**, framework Vite.
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key — never `service_role`). Leave `VITE_API_URL` empty.
3. Edit `frontend/vercel.json`: replace `REPLACE-WITH-YOUR-API-HOST` in the `/api` rewrite with your API host. That keeps the API
   same-origin (no CORS, and `connect-src 'self'` in the CSP stays valid). If resume uploads fail through the proxy
   (platform body-size limits), instead set `VITE_API_URL` to the API origin and add the frontend origin to `CORS_ORIGINS`
   and to `connect-src` in `vercel.json`.
4. The security headers (CSP, HSTS, frame denial …) are in `vercel.json`; the production build was verified to run under that CSP with zero violations.

## 5. Go-live checklist

- [ ] `supabase/tests/run.sh` and `upgrade_test.sh` green on the exact migration set being applied
- [ ] New migrations applied to Supabase (done 2026-09-30; history reconciled); advisors show no RLS findings; leaked-password protection on (Pro plan) or accepted as a known gap
- [ ] Redirect URLs + email confirmation configured; first admin promoted
- [ ] API deployed; `/ready` returns `ready`; `CORS_ORIGINS` is the real origin
- [ ] Frontend deployed with the two public variables; `vercel.json` API host replaced
- [ ] A real signup → email verification → onboarding → dashboard done by hand on production
- [ ] Google provider enabled and one real Google sign-in done (the automated suite cannot do this)
- [ ] `python -m app.devseed catalog` is **not** run in production; enable a real source only after reviewing its terms/robots.txt
- [ ] Sentry/log drain attached to the JSON logs (they are structured and secret-redacted)

## Not verified on the build machine

Docker image builds (`backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`), the GitHub Actions workflow,
Vercel/Render deployment, and anything involving real Google credentials or real email delivery.
