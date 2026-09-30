#!/usr/bin/env bash
# UPGRADE-PATH TEST (local only). The hosted project already has the first 8 migrations applied and holds real users.
# This rebuilds that exact state locally, inserts representative existing rows, applies every NEWER migration on top,
# and proves: no migration errors, no data loss, constraints still valid, and the DB security suite still passes.
#   supabase/tests/upgrade_test.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DB=nirmaan_upgrade
BASELINE_LAST=20260920163217          # newest migration already applied on the hosted project
case "${PGHOST:-localhost}" in localhost|127.0.0.1|/tmp|/var/run/postgresql) ;; *) echo "refusing non-local host" >&2; exit 1;; esac
PSQL=(psql -X -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
"${PSQL[@]}" -d postgres -c "alter database $DB set search_path = \"\$user\", public, extensions"
"${PSQL[@]}" -d "$DB" -f "$HERE/../local/00_supabase_stub.sql" >/dev/null

echo "== 1. build the hosted project's CURRENT state (migrations <= $BASELINE_LAST)"
for f in "$HERE"/../migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [ "$v" -le "$BASELINE_LAST" ] || continue
  "${PSQL[@]}" -d "$DB" -1 -f "$f" >/dev/null 2>&1
done

echo "== 2. insert existing data (what real users would already have)"
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'existing1@example.com', '{"full_name":"Existing One"}'),
  ('22222222-2222-2222-2222-222222222222', 'existing2@example.com', '{"full_name":"Existing Two"}');
set role service_role;
insert into public.profile_skills (profile_id, skill_id) select '11111111-1111-1111-1111-111111111111', id from public.skills where name in ('python','sql');
insert into public.profile_interests (profile_id, interest_id) select '11111111-1111-1111-1111-111111111111', id from public.interests where name = 'AI/ML';
update public.profiles set branch = 'CSE', onboarding_completed = true where id = '11111111-1111-1111-1111-111111111111';
insert into public.notifications (student_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'profile_completion', 'Finish your profile'), ('22222222-2222-2222-2222-222222222222', 'deadline_approaching', 'old deadline');
insert into public.activities (student_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'profile_updated', 'Updated profile');
insert into public.organizations (slug, name) values ('legacy-org', 'Legacy Org');
insert into public.opportunities (organization_id, title, difficulty, format, source_type) select id, 'Legacy Opportunity', 'advanced', 'offline', 'official' from public.organizations where slug = 'legacy-org';
insert into public.saved_searches (student_id, name, query) values ('11111111-1111-1111-1111-111111111111', 'legacy alert', 'python');
reset role;
SQL
BEFORE="$("${PSQL[@]}" -d "$DB" -At -c "select (select count(*) from public.profiles), (select count(*) from public.profile_skills), (select count(*) from public.notifications), (select count(*) from public.opportunities), (select count(*) from public.saved_searches), (select count(*) from public.activities)")"

echo "== 3. apply every NEWER migration on top"
for f in "$HERE"/../migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  [ "$v" -gt "$BASELINE_LAST" ] || continue
  echo "   apply $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -1 -f "$f" >/dev/null
done

echo "== 4. verify no data was lost and new columns carry sane values"
AFTER="$("${PSQL[@]}" -d "$DB" -At -c "select (select count(*) from public.profiles), (select count(*) from public.profile_skills), (select count(*) from public.notifications), (select count(*) from public.opportunities), (select count(*) from public.saved_searches), (select count(*) from public.activities)")"
[ "$BEFORE" = "$AFTER" ] || { echo "DATA CHANGED: before=$BEFORE after=$AFTER" >&2; exit 1; }
"${PSQL[@]}" -d "$DB" -At <<'SQL' | tee /tmp/upgrade_checks.txt
select 'legacy skills stay confirmed: ' || bool_and(status = 'confirmed' and confirmed_at is not null and source = 'user') from public.profile_skills;
select 'legacy opportunity: difficulty kept, unknowns are NULL: ' || (difficulty = 'advanced' and format = 'offline' and work_mode is null and verification_status = 'unverified' and freshness_status = 'unknown') from public.opportunities;
select 'legacy notification kinds still allowed: ' || (count(*) = 2) from public.notifications;
select 'all constraints validated: ' || (count(*) = 0) from pg_constraint where connamespace = 'public'::regnamespace and not convalidated;
select 'new tables exist: ' || (count(*) = 8) from information_schema.tables where table_schema = 'public' and table_name in ('user_events','skill_evidence','notification_preferences','opportunity_sources','ingestion_runs','opportunity_source_links','opportunity_embeddings','oauth_connections');
select 'RLS on every table: ' || (count(*) = 0) from pg_tables where schemaname = 'public' and not rowsecurity;
SQL
grep -q ": false" /tmp/upgrade_checks.txt && { echo "UPGRADE CHECK FAILED" >&2; exit 1; } || true

echo "== 5. the security suite must pass on the UPGRADED database too"
OUT="$(psql -X -d "$DB" -q -f "$HERE/rls_tests.sql" 2>&1 || true)"
echo "$OUT" | grep -E "ERROR|FATAL" && { echo "SQL error in security tests" >&2; exit 2; } || true
P=$(echo "$OUT" | grep -c 'CHECK|PASS' || true); F=$(echo "$OUT" | grep -c 'CHECK|FAIL' || true)
echo "   security checks: $P passed, $F failed"
[ "$F" -eq 0 ] && [ "$P" -gt 0 ]
echo "UPGRADE PATH OK: data preserved, constraints valid, security suite green"
