-- NEW. Behavioural events (explainable personalization) + skill evidence ledger.

create table public.user_events (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  event_type     text not null check (event_type in (
                   'opportunity_view','search','save','unsave','compare','application_start',
                   'application_submit','dismiss','alert_create','team_create','idea_submit')),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  payload        jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 4096),
  created_at     timestamptz not null default now()
);
create index user_events_student_idx      on public.user_events (student_id, created_at desc);
create index user_events_student_type_idx on public.user_events (student_id, event_type);
create index user_events_opportunity_idx  on public.user_events (opportunity_id) where opportunity_id is not null;
alter table public.user_events enable row level security;
create policy user_events_select on public.user_events for select to authenticated using (student_id = (select auth.uid()));
create policy user_events_insert on public.user_events for insert to authenticated with check (student_id = (select auth.uid()));
revoke all on public.user_events from anon, authenticated;
grant select, insert on public.user_events to authenticated;
grant all on public.user_events to service_role;

-- A skill on a profile is either CONFIRMED by the student or INFERRED by the system.
-- Only confirmed skills count towards fit scores; inferred ones are shown as suggestions.
alter table public.profile_skills
  add column status       text not null default 'confirmed' check (status in ('confirmed', 'inferred')),
  add column source       text not null default 'user' check (source in ('user', 'resume', 'project', 'application', 'behavior')),
  add column confidence   numeric(3,2) not null default 1.00 check (confidence >= 0 and confidence <= 1),
  add column confirmed_at timestamptz,
  add column updated_at   timestamptz not null default now();
update public.profile_skills set confirmed_at = now() where status = 'confirmed' and confirmed_at is null;
create trigger profile_skills_set_updated_at before update on public.profile_skills
  for each row execute function public.set_updated_at();
create policy profile_skills_update on public.profile_skills for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
grant update (status, source, confidence, confirmed_at) on public.profile_skills to authenticated;

create table public.skill_evidence (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  skill_id   uuid not null references public.skills(id) on delete cascade,
  source     text not null check (source in ('user', 'resume', 'project', 'application', 'behavior')),
  evidence   text not null check (char_length(evidence) between 1 and 500),
  confidence numeric(3,2) not null default 0.50 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);
create index skill_evidence_profile_idx on public.skill_evidence (profile_id, skill_id);
alter table public.skill_evidence enable row level security;
create policy skill_evidence_select on public.skill_evidence for select to authenticated using (profile_id = (select auth.uid()));
create policy skill_evidence_insert on public.skill_evidence for insert to authenticated with check (profile_id = (select auth.uid()));
create policy skill_evidence_delete on public.skill_evidence for delete to authenticated using (profile_id = (select auth.uid()));
revoke all on public.skill_evidence from anon, authenticated;
grant select, insert, delete on public.skill_evidence to authenticated;
grant all on public.skill_evidence to service_role;
