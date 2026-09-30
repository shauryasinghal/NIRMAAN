-- NIRMAAN baseline schema.
--
-- RECONSTRUCTION NOTE: this migration (and the 7 that follow it up to
-- 20260920163217) was already applied to the hosted project `nirmaan`
-- before the SQL was ever committed to git. The files here were rebuilt from
-- the live catalog (columns, CHECKs, FKs with delete rules, indexes, policies,
-- function bodies) so an empty database converges to the same state.
-- Migrations dated after 20260920163217 are new work.

create extension if not exists pgcrypto  with schema extensions;
create extension if not exists pg_trgm   with schema extensions;
create extension if not exists vector    with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ── Enumerations ────────────────────────────────────────────────────────────
create type public.app_role             as enum ('student', 'reviewer', 'admin');
create type public.skill_level          as enum ('beginner', 'intermediate', 'advanced');
create type public.participation_pref   as enum ('individual', 'team', 'either');
create type public.participation_mode   as enum ('individual', 'team');
create type public.opportunity_format   as enum ('online', 'offline', 'hybrid');
create type public.source_type          as enum ('official', 'aggregator', 'unverified', 'dev_seed');
create type public.application_status   as enum ('wishlist','saved','planning','applying','applied','shortlisted','interview','selected','rejected','withdrawn');
create type public.idea_kind            as enum ('reference', 'submission');
create type public.idea_status          as enum ('novel','worth_reviewing','needs_review','confirmed_overlap','dismissed');
create type public.review_state         as enum ('pending', 'decided');
create type public.review_decision_kind as enum ('confirm_overlap', 'dismiss', 'needs_review');

-- Shared trigger function: maintain updated_at.
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ── Identity ────────────────────────────────────────────────────────────────
create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  email                   text not null,
  full_name               text not null default '' check (char_length(full_name) <= 120),
  role                    public.app_role not null default 'student',
  year                    text check (year is null or char_length(year) <= 20),
  branch                  text check (branch is null or char_length(branch) <= 80),
  experience_level        public.skill_level not null default 'beginner',
  availability_hrs        integer not null default 5 check (availability_hrs >= 0 and availability_hrs <= 80),
  open_to_team            boolean not null default false,
  onboarding_completed    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  participation_pref      public.participation_pref not null default 'either',
  onboarding_completed_at timestamptz
);
create index profiles_role_idx         on public.profiles (role);
create index profiles_open_to_team_idx on public.profiles (id) where open_to_team;

create table public.skills (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug = lower(slug)),
  name       text not null unique,
  created_at timestamptz not null default now(),
  category   text
);

create table public.interests (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug = lower(slug)),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table public.profile_skills (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  skill_id   uuid not null references public.skills(id) on delete cascade,
  primary key (profile_id, skill_id)
);
create index profile_skills_skill_idx on public.profile_skills (skill_id);

create table public.profile_interests (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  primary key (profile_id, interest_id)
);
create index profile_interests_interest_idx on public.profile_interests (interest_id);

-- ── Catalog ─────────────────────────────────────────────────────────────────
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug = lower(slug)),
  name       text not null unique check (char_length(name) >= 1 and char_length(name) <= 160),
  website    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  domain_id       uuid references public.interests(id) on delete set null,
  title           text not null check (char_length(title) >= 3 and char_length(title) <= 200),
  description     text not null default '' check (char_length(description) <= 5000),
  category        text,
  difficulty      public.skill_level not null default 'intermediate',
  format          public.opportunity_format not null default 'online',
  participation   public.participation_mode,
  min_team_size   smallint check (min_team_size is null or min_team_size >= 1),
  max_team_size   smallint check (max_team_size is null or max_team_size >= 1),
  deadline        date,
  external_url    text check (external_url is null or external_url ~* '^https?://'),
  source          text not null default '',
  source_type     public.source_type not null default 'unverified',
  status          text not null default 'active' check (status in ('active', 'archived')),
  search_text     text generated always as (lower(title || ' ' || description)) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (max_team_size is null or min_team_size is null or max_team_size >= min_team_size)
);
create index opportunities_category_idx    on public.opportunities (category);
create index opportunities_created_idx     on public.opportunities (created_at desc);
create index opportunities_deadline_idx    on public.opportunities (deadline) where status = 'active';
create index opportunities_domain_idx      on public.opportunities (domain_id);
create index opportunities_org_idx         on public.opportunities (organization_id);
create index opportunities_search_trgm_idx on public.opportunities using gin (search_text extensions.gin_trgm_ops);

create table public.opportunity_skills (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  skill_id       uuid not null references public.skills(id) on delete cascade,
  primary key (opportunity_id, skill_id)
);
create index opportunity_skills_skill_idx on public.opportunity_skills (skill_id);

-- ── Ideas / originality ─────────────────────────────────────────────────────
create table public.ideas (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references public.profiles(id) on delete cascade,
  kind            public.idea_kind not null,
  title           text not null check (char_length(title) >= 3 and char_length(title) <= 200),
  description     text not null check (char_length(description) >= 10 and char_length(description) <= 5000),
  domain_id       uuid references public.interests(id) on delete set null,
  source          text,
  status          public.idea_status not null default 'novel',
  novelty_score   numeric check (novelty_score >= 0 and novelty_score <= 100),
  top_similarity  numeric check (top_similarity >= 0 and top_similarity <= 100),
  embedding_model text,
  search_backend  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ideas_owner_matches_kind check (
    (kind = 'reference' and owner_id is null) or (kind = 'submission' and owner_id is not null))
);
create index ideas_domain_idx      on public.ideas (domain_id);
create index ideas_kind_status_idx on public.ideas (kind, status);
create index ideas_owner_idx       on public.ideas (owner_id, created_at desc);

create table public.idea_embeddings (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references public.ideas(id) on delete cascade,
  model      text not null,
  embedding  extensions.vector(384) not null,
  created_at timestamptz not null default now(),
  unique (idea_id, model)
);
create index idea_embeddings_hnsw_idx on public.idea_embeddings using hnsw (embedding extensions.vector_cosine_ops);

create table public.idea_matches (
  id               uuid primary key default gen_random_uuid(),
  idea_id          uuid not null references public.ideas(id) on delete cascade,
  matched_idea_id  uuid not null references public.ideas(id) on delete cascade,
  similarity       numeric not null check (similarity >= 0 and similarity <= 100),
  rank             smallint not null check (rank >= 1),
  visible_to_owner boolean not null default true,
  created_at       timestamptz not null default now(),
  check (idea_id <> matched_idea_id),
  unique (idea_id, matched_idea_id)
);
create index idea_matches_matched_idx on public.idea_matches (matched_idea_id);

create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null unique references public.ideas(id) on delete cascade,
  state      public.review_state not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_state_idx on public.reviews (state, created_at);

create table public.review_decisions (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.reviews(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision    public.review_decision_kind not null,
  note        text check (note is null or char_length(note) <= 2000),
  created_at  timestamptz not null default now()
);
create index review_decisions_review_idx   on public.review_decisions (review_id, created_at);
create index review_decisions_reviewer_idx on public.review_decisions (reviewer_id, created_at desc);

-- ── Teams ───────────────────────────────────────────────────────────────────
create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  coverage_score  numeric not null check (coverage_score >= 0 and coverage_score <= 1),
  diversity_score numeric not null check (diversity_score >= 0 and diversity_score <= 1),
  requested_size  smallint not null check (requested_size >= 2 and requested_size <= 10),
  created_at      timestamptz not null default now()
);
create index teams_owner_idx on public.teams (owner_id, created_at desc);

create table public.team_memberships (
  team_id    uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, profile_id)
);
create index team_memberships_profile_idx on public.team_memberships (profile_id);

create table public.team_target_skills (
  team_id  uuid not null references public.teams(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  primary key (team_id, skill_id)
);
create index team_target_skills_skill_idx on public.team_target_skills (skill_id);

-- ── Activity ────────────────────────────────────────────────────────────────
create table public.applications (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status         public.application_status not null default 'wishlist',
  notes          text not null default '' check (char_length(notes) <= 5000),
  next_action    text check (next_action is null or char_length(next_action) <= 300),
  reminder_at    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (student_id, opportunity_id)
);
create index applications_opportunity_idx    on public.applications (opportunity_id);
create index applications_reminder_idx       on public.applications (reminder_at) where reminder_at is not null;
create index applications_student_status_idx on public.applications (student_id, status);

create table public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  kind           text not null check (kind in ('created','status_changed','note_added','next_action_set','reminder_set')),
  detail         text not null default '',
  created_at     timestamptz not null default now()
);
create index application_events_app_idx on public.application_events (application_id, created_at);

create table public.saved_opportunities (
  student_id     uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  saved_at       timestamptz not null default now(),
  primary key (student_id, opportunity_id)
);
create index saved_opportunities_opp_idx on public.saved_opportunities (opportunity_id);

create table public.saved_searches (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles(id) on delete cascade,
  name              text not null check (char_length(name) >= 1 and char_length(name) <= 80),
  query             text not null default '' check (char_length(query) <= 200),
  domain_id         uuid references public.interests(id) on delete set null,
  skill_id          uuid references public.skills(id) on delete set null,
  min_fit           numeric check (min_fit is null or (min_fit >= 0 and min_fit <= 100)),
  enabled           boolean not null default true,
  last_evaluated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index saved_searches_domain_idx  on public.saved_searches (domain_id);
create index saved_searches_skill_idx   on public.saved_searches (skill_id);
create index saved_searches_student_idx on public.saved_searches (student_id);

create table public.saved_search_hits (
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  notified_at     timestamptz not null default now(),
  primary key (saved_search_id, opportunity_id)
);
create index saved_search_hits_opp_idx on public.saved_search_hits (opportunity_id);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('deadline_approaching','application_reminder','recommendation_update',
                                           'reviewer_decision','saved_search_match','profile_completion','originality_review')),
  title      text not null check (char_length(title) <= 200),
  body       text not null default '' check (char_length(body) <= 1000),
  link       text,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, dedupe_key)
);
create index notifications_student_idx on public.notifications (student_id, created_at desc);

create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  link       text,
  created_at timestamptz not null default now()
);
create index activities_student_idx on public.activities (student_id, created_at desc);

create table public.recommendation_events (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  event_type     text not null check (event_type in ('saved', 'applied')),
  fit_score      numeric not null check (fit_score >= 0 and fit_score <= 100),
  created_at     timestamptz not null default now()
);
create index recommendation_events_opp_idx     on public.recommendation_events (opportunity_id);
create index recommendation_events_student_idx on public.recommendation_events (student_id, created_at desc);

create table public.skill_gap_insights (
  student_id       uuid not null references public.profiles(id) on delete cascade,
  skill_id         uuid not null references public.skills(id) on delete cascade,
  unlocks_count    integer not null check (unlocks_count >= 0),
  high_fit_unlocks integer not null check (high_fit_unlocks >= 0),
  computed_at      timestamptz not null default now(),
  primary key (student_id, skill_id)
);
create index skill_gap_insights_skill_idx on public.skill_gap_insights (skill_id);

create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger applications_set_updated_at  before update on public.applications  for each row execute function public.set_updated_at();
create trigger ideas_set_updated_at         before update on public.ideas         for each row execute function public.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger reviews_set_updated_at       before update on public.reviews       for each row execute function public.set_updated_at();
create trigger saved_searches_set_updated_at before update on public.saved_searches for each row execute function public.set_updated_at();
