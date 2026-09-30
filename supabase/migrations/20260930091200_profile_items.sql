-- NEW. Structured profile content the student has explicitly confirmed (from a resume or typed in).
alter table public.profiles add column links jsonb not null default '{}'::jsonb check (jsonb_typeof(links) = 'object' and pg_column_size(links) <= 2048);
grant update (links) on public.profiles to authenticated;

create table public.profile_items (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('education', 'project', 'certification', 'experience', 'achievement')),
  text       text not null check (char_length(text) between 1 and 400),
  source     text not null default 'user' check (source in ('user', 'resume')),
  created_at timestamptz not null default now(),
  unique (profile_id, kind, text)
);
create index profile_items_profile_idx on public.profile_items (profile_id, kind);
alter table public.profile_items enable row level security;
create policy profile_items_select on public.profile_items for select to authenticated using (profile_id = (select auth.uid()));
create policy profile_items_insert on public.profile_items for insert to authenticated with check (profile_id = (select auth.uid()));
create policy profile_items_delete on public.profile_items for delete to authenticated using (profile_id = (select auth.uid()));
revoke all on public.profile_items from anon, authenticated;
grant select, insert, delete on public.profile_items to authenticated;
grant all on public.profile_items to service_role;
