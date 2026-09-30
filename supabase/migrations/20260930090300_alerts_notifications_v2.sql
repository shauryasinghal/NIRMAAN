-- NEW. Smart-alert criteria, notification kinds and per-user preferences.

alter table public.saved_searches
  add column category             text check (category is null or char_length(category) <= 80),
  add column location             text check (location is null or char_length(location) <= 160),
  add column work_mode            text check (work_mode in ('remote', 'onsite', 'hybrid')),
  add column participation        public.participation_mode,
  add column deadline_within_days smallint check (deadline_within_days is null or deadline_within_days between 1 and 365);

alter table public.saved_search_hits add column fit_score numeric check (fit_score is null or (fit_score >= 0 and fit_score <= 100));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'deadline_approaching','application_reminder','recommendation_update','reviewer_decision',
  'saved_search_match','profile_completion','originality_review',
  'high_fit_opportunity','smart_alert','application_update','team_event'));

create table public.notification_preferences (
  student_id          uuid primary key references public.profiles(id) on delete cascade,
  high_fit            boolean not null default true,
  smart_alert         boolean not null default true,
  deadline            boolean not null default true,
  application_update  boolean not null default true,
  team_event          boolean not null default true,
  originality_review  boolean not null default true,
  min_fit_for_notify  numeric not null default 75 check (min_fit_for_notify between 0 and 100),
  updated_at          timestamptz not null default now()
);
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();
alter table public.notification_preferences enable row level security;
create policy notification_preferences_select on public.notification_preferences for select to authenticated using (student_id = (select auth.uid()));
create policy notification_preferences_insert on public.notification_preferences for insert to authenticated with check (student_id = (select auth.uid()));
create policy notification_preferences_update on public.notification_preferences for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
