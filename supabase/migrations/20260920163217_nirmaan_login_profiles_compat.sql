-- Compatibility guard: make sure profiles created by older auth users carry the
-- onboarding/participation columns. Idempotent; a no-op on a fresh build.
alter table public.profiles add column if not exists participation_pref public.participation_pref not null default 'either';
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
insert into public.profiles (id, email, full_name)
select u.id, coalesce(u.email, ''), left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), 120)
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
