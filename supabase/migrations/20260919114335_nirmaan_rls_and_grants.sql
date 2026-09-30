-- Reconstructed from the live catalog. Deny-by-default: RLS on every table,
-- anon has no table privileges, authenticated gets only what policies allow.
-- Writes to system-owned tables (ideas, reviews, notifications, teams, …) happen
-- through the backend's service session or SECURITY DEFINER functions.

alter table public.profiles              enable row level security;
alter table public.skills                enable row level security;
alter table public.interests             enable row level security;
alter table public.profile_skills        enable row level security;
alter table public.profile_interests     enable row level security;
alter table public.organizations         enable row level security;
alter table public.opportunities         enable row level security;
alter table public.opportunity_skills    enable row level security;
alter table public.ideas                 enable row level security;
alter table public.idea_embeddings       enable row level security;
alter table public.idea_matches          enable row level security;
alter table public.reviews               enable row level security;
alter table public.review_decisions      enable row level security;
alter table public.teams                 enable row level security;
alter table public.team_memberships      enable row level security;
alter table public.team_target_skills    enable row level security;
alter table public.applications          enable row level security;
alter table public.application_events    enable row level security;
alter table public.saved_opportunities   enable row level security;
alter table public.saved_searches        enable row level security;
alter table public.saved_search_hits     enable row level security;
alter table public.notifications         enable row level security;
alter table public.activities            enable row level security;
alter table public.recommendation_events enable row level security;
alter table public.skill_gap_insights    enable row level security;
alter table public.audit_log             enable row level security;

-- ── Reference / catalog data: everyone signed-in reads, admins write ───────
do $$
declare t text;
begin
  foreach t in array array['skills','interests','organizations','opportunities','opportunity_skills'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))', t || '_admin_delete', t);
  end loop;
end $$;

-- ── Profiles: own row (or admin). Role is protected by trigger + admin_set_role.
create policy profiles_select     on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy profile_skills_select on public.profile_skills for select to authenticated using (profile_id = (select auth.uid()));
create policy profile_skills_insert on public.profile_skills for insert to authenticated with check (profile_id = (select auth.uid()));
create policy profile_skills_delete on public.profile_skills for delete to authenticated using (profile_id = (select auth.uid()));
create policy profile_interests_select on public.profile_interests for select to authenticated using (profile_id = (select auth.uid()));
create policy profile_interests_insert on public.profile_interests for insert to authenticated with check (profile_id = (select auth.uid()));
create policy profile_interests_delete on public.profile_interests for delete to authenticated using (profile_id = (select auth.uid()));

-- ── Student-owned activity ─────────────────────────────────────────────────
create policy applications_select on public.applications for select to authenticated using (student_id = (select auth.uid()));
create policy applications_insert on public.applications for insert to authenticated with check (student_id = (select auth.uid()));
create policy applications_update on public.applications for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy applications_delete on public.applications for delete to authenticated using (student_id = (select auth.uid()));

create policy application_events_select on public.application_events for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_events.application_id and a.student_id = (select auth.uid())));

create policy saved_opportunities_select on public.saved_opportunities for select to authenticated using (student_id = (select auth.uid()));
create policy saved_opportunities_insert on public.saved_opportunities for insert to authenticated with check (student_id = (select auth.uid()));
create policy saved_opportunities_delete on public.saved_opportunities for delete to authenticated using (student_id = (select auth.uid()));

create policy saved_searches_select on public.saved_searches for select to authenticated using (student_id = (select auth.uid()));
create policy saved_searches_insert on public.saved_searches for insert to authenticated with check (student_id = (select auth.uid()));
create policy saved_searches_update on public.saved_searches for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy saved_searches_delete on public.saved_searches for delete to authenticated using (student_id = (select auth.uid()));

create policy notifications_select on public.notifications for select to authenticated using (student_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

create policy activities_select on public.activities for select to authenticated using (student_id = (select auth.uid()));
create policy activities_insert on public.activities for insert to authenticated with check (student_id = (select auth.uid()));

create policy recommendation_events_select on public.recommendation_events for select to authenticated using (student_id = (select auth.uid()));
create policy skill_gap_insights_select    on public.skill_gap_insights    for select to authenticated using (student_id = (select auth.uid()));

-- ── Teams (owner-visible) ──────────────────────────────────────────────────
create policy teams_select on public.teams for select to authenticated using (owner_id = (select auth.uid()));
create policy teams_delete on public.teams for delete to authenticated using (owner_id = (select auth.uid()));
create policy team_memberships_select on public.team_memberships for select to authenticated
  using (exists (select 1 from public.teams t where t.id = team_memberships.team_id and t.owner_id = (select auth.uid())));
create policy team_target_skills_select on public.team_target_skills for select to authenticated
  using (exists (select 1 from public.teams t where t.id = team_target_skills.team_id and t.owner_id = (select auth.uid())));

-- ── Ideas, reviews, audit ──────────────────────────────────────────────────
create policy ideas_select on public.ideas for select to authenticated
  using (kind = 'reference' or owner_id = (select auth.uid()) or (select private.is_reviewer()));
create policy idea_matches_select on public.idea_matches for select to authenticated
  using ((select private.is_reviewer())
         or (visible_to_owner and exists (select 1 from public.ideas i where i.id = idea_matches.idea_id and i.owner_id = (select auth.uid()))));
create policy reviews_select          on public.reviews          for select to authenticated using ((select private.is_reviewer()));
create policy review_decisions_select on public.review_decisions for select to authenticated using ((select private.is_reviewer()));
create policy audit_log_select        on public.audit_log        for select to authenticated using ((select private.is_admin()));

-- ── Table privileges (Supabase grants everything by default — undo that) ───
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;

grant select, update                 on public.profiles              to authenticated;
grant select, insert, delete         on public.profile_skills        to authenticated;
grant select, insert, delete         on public.profile_interests     to authenticated;
grant select, insert, update, delete on public.skills                to authenticated;
grant select, insert, update, delete on public.interests             to authenticated;
grant select, insert, update, delete on public.organizations         to authenticated;
grant select, insert, update, delete on public.opportunities         to authenticated;
grant select, insert, update, delete on public.opportunity_skills    to authenticated;
grant select                         on public.ideas                 to authenticated;
grant select                         on public.idea_matches          to authenticated;
grant select                         on public.reviews               to authenticated;
grant select                         on public.review_decisions      to authenticated;
grant select, delete                 on public.teams                 to authenticated;
grant select                         on public.team_memberships      to authenticated;
grant select                         on public.team_target_skills    to authenticated;
grant select, insert, update, delete on public.applications          to authenticated;
grant select                         on public.application_events    to authenticated;
grant select, insert, delete         on public.saved_opportunities   to authenticated;
grant select, insert, update, delete on public.saved_searches        to authenticated;
grant select                         on public.notifications         to authenticated;
grant select, insert                 on public.activities            to authenticated;
grant select                         on public.recommendation_events to authenticated;
grant select                         on public.skill_gap_insights    to authenticated;
grant select                         on public.audit_log             to authenticated;
grant all on all tables in schema public to service_role;

-- ── private schema: usable for policy helpers + explicit RPCs only ─────────
grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on function private.is_admin(), private.is_reviewer(), private.current_app_role() to authenticated, service_role;
grant execute on function private.decide_review(uuid, public.review_decision_kind, text) to authenticated, service_role;
grant execute on function private.admin_set_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.team_candidates(integer) to authenticated, service_role;
grant execute on function private.match_reference_ideas(extensions.vector, text, integer) to authenticated, service_role;
grant execute on function private.match_submission_overlaps(extensions.vector, text, uuid, integer) to authenticated, service_role;
grant execute on function private.run_scheduled_sql_jobs(), private.generate_deadline_reminders(),
      private.generate_application_reminders(), private.generate_profile_reminders() to service_role;
