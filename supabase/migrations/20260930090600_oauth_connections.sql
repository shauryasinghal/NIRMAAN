-- NEW. Optional Google Calendar / Gmail connections (separate from Google *login*, which is
-- handled entirely by Supabase Auth). Tokens are encrypted by the API before storage and this
-- table is unreachable from the client roles: RLS on, no policy, no grants.

create table public.oauth_connections (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  provider          text not null check (provider in ('google_calendar', 'gmail')),
  scopes            text[] not null default '{}',
  access_token_enc  text,
  refresh_token_enc text,
  expires_at        timestamptz,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (profile_id, provider)
);
create trigger oauth_connections_set_updated_at before update on public.oauth_connections
  for each row execute function public.set_updated_at();
alter table public.oauth_connections enable row level security;
create policy oauth_connections_deny_clients on public.oauth_connections for all to authenticated using (false) with check (false);
revoke all on public.oauth_connections from anon, authenticated;
grant all on public.oauth_connections to service_role;
