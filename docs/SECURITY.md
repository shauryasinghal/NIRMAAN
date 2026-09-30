# Security model and audit

## Trust boundaries

```
Browser ──(Supabase JWT, Bearer)──▶ FastAPI ──(SET ROLE authenticated + JWT claims)──▶ Postgres (RLS)
   │                                   │  explicit `with db.service():` only for system writes
   └──(PKCE OAuth / email)──▶ Supabase Auth (issues tokens; NIRMAAN never does)
```

1. **Identity** comes only from a verified Supabase token: algorithm allow-list per key type (`HS256` with the shared
   secret **or** `ES256/RS256/EdDSA` via the project's JWKS — never both, so no algorithm confusion), `aud=authenticated`,
   `exp`+`sub` required, `iss` checked when `SUPABASE_URL` is set, `role` claim must be `authenticated` (anon/service keys rejected),
   and the token's Supabase **session must still exist** (sign-out takes effect within `SESSION_CACHE_SECONDS`).
2. **Role** comes from `public.profiles.role`, never from the token or the client. Nothing accepts `user_id`, `student_id`,
   `owner_id` or `role` as input (asserted over the OpenAPI schema by a test).
3. **Row Level Security** is on for every table. The API runs each request as the `authenticated` role with the caller's claims, so a query
   that forgets a filter is still constrained by the database. Privileged writes (notifications, embeddings, teams, audit) are explicit
   `service_role` blocks or `SECURITY DEFINER` functions with a pinned `search_path`.
4. **Privilege escalation** is closed at four layers: signup ignores role metadata (`handle_new_user`); `profiles` column grants exclude `role`,
   `email`, `id`; a trigger blocks role changes by non-admins; the only path is `private.admin_set_role` (admin-only, audited, refuses to remove the last admin).
5. **Append-only evidence:** `audit_log` and `review_decisions` reject UPDATE/DELETE (FK cascades from deleting an idea or account are the only exception).

## Data protection

- Team Builder shows only students who opted in (`open_to_team`, default off), and only name, skills, level and availability — never email.
- Another student's idea is never shown to a submitter; near-matches between submissions are visible to reviewers only.
- OAuth tokens (Calendar/Gmail, optional) are Fernet-encrypted in a table clients cannot read; `state` is signed and bound to user + provider + 10-minute expiry; nothing is written to a calendar or mailbox without `confirm: true`.
- Resume files are validated (size while reading, extension + declared MIME + magic bytes must agree, DOCX zip-bomb/traversal/macro checks, PDF page cap, parse timeout), processed in memory, never stored or executed.
- Logs are structured JSON with a redaction filter for bearer tokens, JWTs, passwords, client secrets, OAuth codes and DB URLs.

## Test evidence (all run against a real Postgres, real API, real browser)

| Area | Where | Result |
|---|---|---|
| RLS isolation, role escalation, reviewer/admin rules, append-only, consent gate, SECURITY DEFINER hygiene | `supabase/tests/rls_tests.sql` | 49 checks, also on the **upgraded** hosted-state DB |
| JWT: expired, wrong secret/audience/issuer, `alg=none`, tampered payload, anon/service keys, no-profile user, role-claim smuggling, revoked session, borrowed session, JWKS + algorithm confusion | `backend/tests/api/test_security_platform.py` | pass |
| Every route rejects anonymous requests; role-gated routes reject students/reviewers; no client-supplied identity fields | `backend/tests/api/test_contract.py` | pass (schema-driven, covers new routes automatically) |
| IDOR: applications, saved items, notifications, ideas, alerts, teams, profile items, reviews | domain API tests | pass |
| Malicious uploads: disguised executable, MIME mismatch, oversize, zip bomb, macros, path traversal, encrypted PDF | `backend/tests/api/test_resume.py` | pass |
| Error contract never leaks internals; CORS; security headers; body-size limit; rate limiting (per user, not IP) | `test_security_platform.py` | pass |
| Session revocation end-to-end (sign out in the browser → old token rejected by the API) | Playwright `auth.spec.ts` | pass |
| Strict CSP on the production build | Playwright `csp.spec.ts` | zero violations |
| Dependency vulnerabilities | `pip-audit`, `npm audit` | **0 known** (after upgrading FastAPI/Starlette/PyJWT/python-multipart/pdfminer/cryptography — the earlier pins had 60+ advisories) |
| Secrets | tree + full git history + built bundle | none found; bundle contains only the two public `VITE_` values |
| Unsafe DOM | source scan | no `dangerouslySetInnerHTML`, `eval`, `innerHTML`; external links use `noopener noreferrer nofollow` |

## Findings fixed during the build

Client-selectable `REVIEWER` role at signup · default forgeable JWT secret · Google account-linking by unverified email · custom
parallel auth · Team Builder exposing every student · per-IP (not per-user) rate limiting · onboarding flag never persisted ·
sign-out delayed by a hard-coded cache · outdated, vulnerable dependency pins.

## Known limitations (be aware, not hidden)

- **Rate limiting is in-process.** Correct for one instance; use Redis before scaling out.
- **Session-revocation window** ≤ `SESSION_CACHE_SECONDS` (default 10 s; set 0 to check every request).
- **Supabase JS keeps the session in `localStorage`** (its default), so an XSS bug would expose it. Mitigations: strict CSP (`script-src 'self'`), no dangerous DOM sinks, React escaping. Moving to httpOnly cookies would need a server-side session layer.
- **Not verifiable here:** real GoTrue behaviour (email delivery, password policy, JWKS rotation), real Google OAuth, hosted-project advisors after migration, Docker/CI/Vercel deployment.
- Leaked-password protection is a Supabase dashboard setting, **Pro plan and above only**. The hosted project is on the Free plan, so it is off and the advisor reports one WARN for it (accepted). Use a strong minimum password length / character policy (available on Free) meanwhile.
- The E2E harness blanks `SUPABASE_URL` / `SUPABASE_ANON_KEY` for its own servers, and `app.devseed` refuses to run when `SUPABASE_URL` is set, so a developer's `backend/.env` pointing at a real project can never be seeded or written to by the test runs.
- Resume parsing is bounded by a wall-clock timeout in a thread; a pathological PDF cannot be forcibly killed. Run the API with a request timeout at the proxy.
