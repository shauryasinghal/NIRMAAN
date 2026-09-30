-- NEW. Rich opportunity model + ingestion/attribution tables.
-- Unknown data stays NULL: nothing here has a fabricated default besides
-- verification_status = 'unverified' and freshness_status = 'unknown'.
-- NOTE: `deadline` remains the registration deadline (documented alias).

alter table public.opportunities
  add column subcategory              text check (subcategory is null or char_length(subcategory) <= 80),
  add column tags                     text[] not null default '{}',
  add column eligibility              text check (eligibility is null or char_length(eligibility) <= 1000),
  add column education_requirements   text check (education_requirements is null or char_length(education_requirements) <= 500),
  add column experience_requirements  text check (experience_requirements is null or char_length(experience_requirements) <= 500),
  add column location                 text check (location is null or char_length(location) <= 160),
  add column work_mode                text check (work_mode in ('remote', 'onsite', 'hybrid')),
  add column prize_text               text check (prize_text is null or char_length(prize_text) <= 200),
  add column prize_amount             numeric(14,2) check (prize_amount is null or prize_amount >= 0),
  add column stipend_amount           numeric(12,2) check (stipend_amount is null or stipend_amount >= 0),
  add column stipend_currency         text check (stipend_currency is null or char_length(stipend_currency) = 3),
  add column salary_text              text check (salary_text is null or char_length(salary_text) <= 200),
  add column certificate              boolean,
  add column registration_start       date,
  add column event_start              date,
  add column event_end                date,
  add column application_url          text check (application_url is null or application_url ~* '^https?://'),
  add column canonical_url            text check (canonical_url is null or canonical_url ~* '^https?://'),
  add column source_ref               text,
  add column verification_status      text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'flagged')),
  add column last_verified_at         timestamptz,
  add column last_seen_at             timestamptz,
  add column freshness_status         text not null default 'unknown' check (freshness_status in ('fresh', 'aging', 'stale', 'expired', 'unknown')),
  add column title_norm               text generated always as (btrim(regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g'))) stored,
  add column search_tsv               tsvector generated always as (
                                        setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                                        setweight(to_tsvector('english'::regconfig, coalesce(subcategory, '') || ' ' || coalesce(category, '')), 'B') ||
                                        setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')) stored,
  add constraint opportunities_event_dates_check  check (event_start is null or event_end is null or event_end >= event_start),
  add constraint opportunities_reg_dates_check    check (registration_start is null or deadline is null or deadline >= registration_start);

comment on column public.opportunities.deadline is 'Registration / application deadline (registration_deadline).';

create index opportunities_tags_idx        on public.opportunities using gin (tags);
create index opportunities_tsv_idx         on public.opportunities using gin (search_tsv);
create index opportunities_title_norm_idx  on public.opportunities (organization_id, title_norm);
create index opportunities_work_mode_idx   on public.opportunities (work_mode) where work_mode is not null;
create index opportunities_freshness_idx   on public.opportunities (freshness_status) where status = 'active';
create index opportunities_participation_idx on public.opportunities (participation);
create unique index opportunities_canonical_url_uq on public.opportunities (canonical_url) where canonical_url is not null;

alter table public.opportunity_skills
  add column importance text not null default 'required' check (importance in ('required', 'preferred'));

-- ── Sources, runs, attribution ─────────────────────────────────────────────
create table public.opportunity_sources (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique check (key = lower(key) and char_length(key) <= 60),
  name               text not null,
  kind               text not null check (kind in ('official_api', 'official_feed', 'partner', 'public_listing', 'fixture')),
  base_url           text,
  terms_url          text,
  robots_reviewed_at timestamptz,
  rate_limit_per_min integer not null default 10 check (rate_limit_per_min between 1 and 600),
  enabled            boolean not null default false,
  config             jsonb not null default '{}'::jsonb,
  last_run_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger opportunity_sources_set_updated_at before update on public.opportunity_sources
  for each row execute function public.set_updated_at();

create table public.ingestion_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.opportunity_sources(id) on delete cascade,
  status      text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  fetched     integer not null default 0,
  inserted    integer not null default 0,
  updated     integer not null default 0,
  duplicates  integer not null default 0,
  rejected    integer not null default 0,
  error       text,
  detail      jsonb not null default '{}'::jsonb
);
create index ingestion_runs_source_idx on public.ingestion_runs (source_id, started_at desc);

create table public.opportunity_source_links (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  source_id      uuid not null references public.opportunity_sources(id) on delete cascade,
  external_id    text not null,
  source_url     text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (source_id, external_id)
);
create index opportunity_source_links_opp_idx on public.opportunity_source_links (opportunity_id);

-- 384-d MiniLM vectors for semantic duplicate detection between listings.
create table public.opportunity_embeddings (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  model          text not null,
  embedding      extensions.vector(384) not null,
  updated_at     timestamptz not null default now()
);
create index opportunity_embeddings_hnsw_idx on public.opportunity_embeddings using hnsw (embedding extensions.vector_cosine_ops);

alter table public.opportunity_sources      enable row level security;
alter table public.ingestion_runs           enable row level security;
alter table public.opportunity_source_links enable row level security;
alter table public.opportunity_embeddings   enable row level security;

create policy opportunity_sources_admin_select on public.opportunity_sources for select to authenticated using ((select private.is_admin()));
create policy ingestion_runs_admin_select      on public.ingestion_runs      for select to authenticated using ((select private.is_admin()));
create policy opportunity_source_links_select  on public.opportunity_source_links for select to authenticated using (true);
create policy opportunity_embeddings_deny      on public.opportunity_embeddings for all to authenticated using (false) with check (false);

revoke all on public.opportunity_sources, public.ingestion_runs, public.opportunity_source_links, public.opportunity_embeddings from anon, authenticated;
grant select on public.opportunity_sources, public.ingestion_runs, public.opportunity_source_links to authenticated;
grant all on public.opportunity_sources, public.ingestion_runs, public.opportunity_source_links, public.opportunity_embeddings to service_role;

-- ── Freshness (time-dependent, so a refreshed column rather than a generated one) ──
create or replace function private.refresh_opportunity_freshness() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with upd as (
    update public.opportunities o set freshness_status = case
        when o.deadline is not null and o.deadline < current_date then 'expired'
        when o.last_seen_at is null then 'unknown'
        when o.last_seen_at >= now() - interval '7 days'  then 'fresh'
        when o.last_seen_at >= now() - interval '30 days' then 'aging'
        else 'stale' end
     where o.status = 'active'
       and o.freshness_status is distinct from case
        when o.deadline is not null and o.deadline < current_date then 'expired'
        when o.last_seen_at is null then 'unknown'
        when o.last_seen_at >= now() - interval '7 days'  then 'fresh'
        when o.last_seen_at >= now() - interval '30 days' then 'aging'
        else 'stale' end
    returning 1)
  select count(*) into n from upd;
  return n;
end $$;
revoke execute on function private.refresh_opportunity_freshness() from public;
grant  execute on function private.refresh_opportunity_freshness() to service_role;

create or replace function private.run_scheduled_sql_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'freshnessRefreshed',   private.refresh_opportunity_freshness(),
    'deadlineReminders',    private.generate_deadline_reminders(),
    'applicationReminders', private.generate_application_reminders(),
    'profileReminders',     private.generate_profile_reminders());
end $$;
