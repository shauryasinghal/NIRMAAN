-- Database-level security tests. Run via supabase/tests/run.sh (fresh DB each time).
-- Each block impersonates a Supabase role + JWT claims exactly as PostgREST / the API does.
\set ON_ERROR_STOP on
\pset pager off
\o /dev/null

create temp table t_result (name text, ok boolean, detail text);
grant all on t_result to public;

-- Results are emitted as NOTICEs (they survive ROLLBACK, unlike table rows); run.sh tallies them.
create or replace function pg_temp.check(p_name text, p_ok boolean, p_detail text default '') returns void
language plpgsql as $$ begin raise notice 'CHECK|%|%|%', case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end, p_name, p_detail; end $$;

-- helpers to impersonate a user
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

-- ── fixtures (privileged) ───────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev',   '{"full_name":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rev@test.dev',   '{"full_name":"Rev"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'adm@test.dev',   '{"full_name":"Adm"}'),
  -- attacker signs up passing role=admin in metadata; must still become student
  ('00000000-0000-0000-0000-0000000000ee', 'evil@test.dev',  '{"full_name":"Evil","role":"admin"}');
set role service_role;
update public.profiles set role = 'reviewer' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'admin'    where id = '00000000-0000-0000-0000-0000000000ad';

insert into public.organizations (slug, name) values ('acme', 'Acme');
insert into public.opportunities (id, organization_id, title, source_type)
  values ('10000000-0000-0000-0000-000000000001', (select id from public.organizations where slug='acme'), 'Test Hackathon', 'dev_seed');
insert into public.applications (student_id, opportunity_id) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001');
insert into public.saved_opportunities values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', now());
insert into public.notifications (student_id, kind, title) values ('00000000-0000-0000-0000-00000000000a', 'smart_alert', 'for alice');
insert into public.ideas (id, owner_id, kind, title, description) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'submission', 'Alice idea', 'A description long enough'),
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'submission', 'Reviewer idea', 'A description long enough');
insert into public.reviews (id, idea_id) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1');
insert into public.oauth_connections (profile_id, provider, access_token_enc) values ('00000000-0000-0000-0000-00000000000a', 'gmail', 'secret');
insert into public.teams (id, owner_id, coverage_score, diversity_score, requested_size) values
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 0.5, 0.5, 3);
insert into public.team_memberships (team_id, profile_id, status) values
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'accepted'),
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'invited');
reset role;

-- ── 1. signup can never grant privilege ────────────────────────────────────
select pg_temp.check('signup ignores role in user metadata',
  (select role = 'student' from public.profiles where id = '00000000-0000-0000-0000-0000000000ee'));

-- ── 2. structural invariants ───────────────────────────────────────────────
select pg_temp.check('RLS enabled on every public table',
  not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
  (select string_agg(tablename, ',') from pg_tables where schemaname = 'public' and not rowsecurity));
select pg_temp.check('anon has no privilege on any public table',
  not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'));
select pg_temp.check('authenticated cannot touch oauth_connections',
  not exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='oauth_connections' and grantee='authenticated'));
select pg_temp.check('every SECURITY DEFINER function pins search_path',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname in ('public', 'private') and p.prosecdef
                 and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')));

-- ── 3. anon sees nothing ───────────────────────────────────────────────────
begin;
select pg_temp.as_anon();
do $$ begin
  begin perform 1 from public.opportunities limit 1;
    perform pg_temp.check('anon cannot read opportunities', false);
  exception when insufficient_privilege then perform pg_temp.check('anon cannot read opportunities', true); end;
end $$;
rollback;

-- ── 4. user A vs user B isolation ──────────────────────────────────────────
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('B cannot see A profile',        (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 0);
select pg_temp.check('B sees only own profile',       (select count(*) from public.profiles) = 1);
select pg_temp.check('B cannot see A applications',   (select count(*) from public.applications where student_id = '00000000-0000-0000-0000-00000000000a') = 0);
select pg_temp.check('B sees own application',        (select count(*) from public.applications) = 1);
select pg_temp.check('B cannot see A saved items',    (select count(*) from public.saved_opportunities) = 0);
select pg_temp.check('B cannot see A notifications',  (select count(*) from public.notifications) = 0);
select pg_temp.check('B cannot see A idea',           (select count(*) from public.ideas where id = '20000000-0000-0000-0000-00000000000a') = 0);
select pg_temp.check('B cannot see any review',       (select count(*) from public.reviews) = 0);
select pg_temp.check('B cannot see application events of A',
  (select count(*) from public.application_events e join public.applications a on a.id = e.application_id
    where a.student_id = '00000000-0000-0000-0000-00000000000a') = 0);
do $$
declare n int;
begin
  update public.profiles set full_name = 'pwned' where id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.check('B cannot update A profile (0 rows)', n = 0);
  update public.applications set status = 'selected' where student_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.check('B cannot update A application (0 rows)', n = 0);
  delete from public.applications where student_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform pg_temp.check('B cannot delete A application (0 rows)', n = 0);
  begin
    insert into public.saved_opportunities values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', now());
    perform pg_temp.check('B cannot insert row owned by A', false);
  exception when others then perform pg_temp.check('B cannot insert row owned by A', sqlstate in ('42501')); end;
end $$;
rollback;

-- ── 5. role escalation ─────────────────────────────────────────────────────
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
do $$ begin
  begin update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ee';
    perform pg_temp.check('student cannot UPDATE own role', false);
  exception when insufficient_privilege then perform pg_temp.check('student cannot UPDATE own role', true); end;
  begin perform private.admin_set_role('00000000-0000-0000-0000-0000000000ee', 'admin');
    perform pg_temp.check('student cannot call admin_set_role', false);
  exception when insufficient_privilege then perform pg_temp.check('student cannot call admin_set_role', true); end;
  begin perform private.decide_review('30000000-0000-0000-0000-00000000000a', 'approve', null);
    perform pg_temp.check('student cannot decide a review', false);
  exception when insufficient_privilege then perform pg_temp.check('student cannot decide a review', true); end;
  begin update public.profiles set email = 'x@y.z' where id = '00000000-0000-0000-0000-0000000000ee';
    perform pg_temp.check('student cannot rewrite own email column', false);
  exception when insufficient_privilege then perform pg_temp.check('student cannot rewrite own email column', true); end;
  begin insert into public.notifications (student_id, kind, title) values ('00000000-0000-0000-0000-0000000000ee', 'smart_alert', 'forged');
    perform pg_temp.check('student cannot forge notifications', false);
  exception when insufficient_privilege then perform pg_temp.check('student cannot forge notifications', true); end;
  begin insert into public.ideas (owner_id, kind, title, description) values ('00000000-0000-0000-0000-0000000000ee','submission','x y z','long enough description');
    perform pg_temp.check('student cannot write ideas directly (must go through API)', false);
  exception when insufficient_privilege then perform pg_temp.check('student cannot write ideas directly (must go through API)', true); end;
  begin perform 1 from public.oauth_connections;
    perform pg_temp.check('student cannot read oauth_connections', false);
  exception when insufficient_privilege then perform pg_temp.check('student cannot read oauth_connections', true); end;
  begin perform 1 from public.audit_log;
    perform pg_temp.check('student can read audit_log rows (must be 0)', (select count(*) from public.audit_log) = 0);
  exception when insufficient_privilege then perform pg_temp.check('student can read audit_log rows (must be 0)', true); end;
end $$;
rollback;

-- ── 6. admin role management ───────────────────────────────────────────────
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
select private.admin_set_role('00000000-0000-0000-0000-00000000000b', 'reviewer');
do $$ begin
  perform pg_temp.check('admin promotion is audited',
    exists (select 1 from public.audit_log where action = 'role_changed' and entity_id = '00000000-0000-0000-0000-00000000000b'
              and detail ->> 'to' = 'reviewer' and actor_id = '00000000-0000-0000-0000-0000000000ad'));
  begin perform private.admin_set_role('00000000-0000-0000-0000-0000000000ad', 'student');
    perform pg_temp.check('cannot demote the last admin', false);
  exception when sqlstate 'P0001' then perform pg_temp.check('cannot demote the last admin', true); end;
end $$;
rollback;

-- ── 7. reviewer workflow ───────────────────────────────────────────────────
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check('reviewer sees review queue', (select count(*) from public.reviews) = 2);
do $$
declare d uuid;
begin
  begin perform private.decide_review('30000000-0000-0000-0000-0000000000c1', 'approve', null);
    perform pg_temp.check('reviewer cannot decide own idea', false);
  exception when insufficient_privilege then perform pg_temp.check('reviewer cannot decide own idea', true); end;
  begin perform private.decide_review('30000000-0000-0000-0000-00000000000a', 'reject', null);
    perform pg_temp.check('reject requires a note', false);
  exception when sqlstate '22023' then perform pg_temp.check('reject requires a note', true); end;
  d := private.decide_review('30000000-0000-0000-0000-00000000000a', 'request_changes', 'Please narrow the scope.');
  perform pg_temp.check('decision recorded', d is not null);
  perform pg_temp.check('idea status updated', (select status::text from public.ideas where id = '20000000-0000-0000-0000-00000000000a') = 'changes_requested');
  perform pg_temp.check('review state decided', (select state::text from public.reviews where id = '30000000-0000-0000-0000-00000000000a') = 'decided');
  perform pg_temp.check('reviewer cannot read the audit log directly', (select count(*) from public.audit_log) = 0);
  execute 'set local role service_role';
  perform pg_temp.check('decision is audited', (select count(*) from public.audit_log where action = 'review_decision' and entity_id = '30000000-0000-0000-0000-00000000000a') = 1);
  execute 'set local role authenticated';
  begin perform private.decide_review('30000000-0000-0000-0000-00000000000a', 'approve', null);
    perform pg_temp.check('cannot decide twice', false);
  exception when sqlstate 'P0001' then perform pg_temp.check('cannot decide twice', true); end;
  begin update public.review_decisions set note = 'tampered';
    perform pg_temp.check('reviewer cannot edit decisions', false);
  exception when insufficient_privilege then perform pg_temp.check('reviewer cannot edit decisions', true); end;
end $$;
rollback;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');   -- owner sees decision notification
reset role;
set role service_role;
select private.write_audit(null, 'test', 'x', '1', '{}');
do $$ begin
  begin update public.audit_log set action = 'tampered';
    perform pg_temp.check('audit_log rows cannot be updated', false);
  exception when insufficient_privilege then perform pg_temp.check('audit_log rows cannot be updated', true); end;
  begin delete from public.audit_log;
    perform pg_temp.check('audit_log rows cannot be deleted', false);
  exception when insufficient_privilege then perform pg_temp.check('audit_log rows cannot be deleted', true); end;
end $$;
rollback;

-- escalation -> only admin can finish it
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select private.decide_review('30000000-0000-0000-0000-00000000000a', 'escalate', 'Unsure - needs admin');
do $$ begin
  perform pg_temp.check('escalate keeps review pending-like', (select state::text from public.reviews where id = '30000000-0000-0000-0000-00000000000a') = 'escalated');
  begin perform private.decide_review('30000000-0000-0000-0000-00000000000a', 'approve', null);
    perform pg_temp.check('reviewer cannot decide escalated review', false);
  exception when insufficient_privilege then perform pg_temp.check('reviewer cannot decide escalated review', true); end;
end $$;
rollback;

-- ── 8. teams: no policy recursion, members vs strangers ─────────────────────
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');   -- invited member
select pg_temp.check('invited member can see the team',      (select count(*) from public.teams) = 1);
select pg_temp.check('invited member sees own membership',   (select count(*) from public.team_memberships where profile_id = '00000000-0000-0000-0000-00000000000b') = 1);
rollback;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');   -- stranger
select pg_temp.check('stranger cannot see the team',         (select count(*) from public.teams) = 0);
select pg_temp.check('stranger cannot see memberships',      (select count(*) from public.team_memberships) = 0);
rollback;

-- ── 9. consent-gated team candidates ───────────────────────────────────────
set role service_role;
update public.profiles set open_to_team = true, onboarding_completed = true where id = '00000000-0000-0000-0000-00000000000b';
reset role;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check('candidates include only opted-in students', (select count(*) from private.team_candidates(50)) = 1);
select pg_temp.check('candidates never include self',             (select count(*) from private.team_candidates(50) where id = '00000000-0000-0000-0000-00000000000a') = 0);
rollback;

