-- NEW. Structured profile preferences the recommender / Why-Not engines need.
-- All nullable: "unknown" is a real state and never scored as if it were known.
alter table public.profiles
  add column location          text check (location is null or char_length(location) <= 160),
  add column education_level   text check (education_level in ('high_school', 'undergraduate', 'postgraduate', 'phd', 'other')),
  add column preferred_format  public.opportunity_format;

grant update (location, education_level, preferred_format) on public.profiles to authenticated;
