-- NEW. Teams tied to an opportunity, with roles and an invitation lifecycle.
-- Policies use SECURITY DEFINER helpers: teams <-> team_memberships policies that
-- referenced each other directly would recurse infinitely.

alter table public.teams
  add column opportunity_id uuid references public.opportunities(id) on delete set null,
  add column name           text check (name is null or char_length(name) <= 120),
  add column status         text not null default 'draft' check (status in ('draft', 'forming', 'active', 'archived')),
  add column note           text check (note is null or char_length(note) <= 1000),
  add column explanation    jsonb not null default '{}'::jsonb;
create index teams_opportunity_idx on public.teams (opportunity_id) where opportunity_id is not null;

alter table public.team_memberships
  add column role               text check (role is null or char_length(role) <= 80),
  add column status             text not null default 'accepted' check (status in ('suggested', 'invited', 'accepted', 'declined', 'left')),
  add column contributed_skills text[] not null default '{}',
  add column invited_at         timestamptz,
  add column responded_at       timestamptz;

create or replace function private.is_team_owner(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams t where t.id = p_team and t.owner_id = (select auth.uid())) $$;
create or replace function private.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_memberships m
                  where m.team_id = p_team and m.profile_id = (select auth.uid()) and m.status in ('invited', 'accepted')) $$;
revoke execute on function private.is_team_owner(uuid), private.is_team_member(uuid) from public;
grant  execute on function private.is_team_owner(uuid), private.is_team_member(uuid) to authenticated, service_role;

drop policy teams_select on public.teams;
drop policy team_memberships_select on public.team_memberships;
drop policy team_target_skills_select on public.team_target_skills;
create policy teams_select on public.teams for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_team_member(id)));
create policy team_memberships_select on public.team_memberships for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_team_owner(team_id)));
create policy team_target_skills_select on public.team_target_skills for select to authenticated
  using ((select private.is_team_owner(team_id)) or (select private.is_team_member(team_id)));
