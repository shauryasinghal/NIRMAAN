-- Reconstructed from the live catalog (see note in 20260919114229_nirmaan_schema.sql).
-- All SECURITY DEFINER functions pin search_path to '' and fully-qualify objects.

-- ── Role helpers (used by RLS policies) ────────────────────────────────────
create or replace function private.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) $$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())), false) $$;

create or replace function private.is_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role in ('reviewer', 'admin') from public.profiles p where p.id = (select auth.uid())), false) $$;

-- ── Auth → profile sync ────────────────────────────────────────────────────
-- SECURITY: role is NEVER read from user metadata. Every signup is a student.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''),
          left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '')
   where id = new.id and email is distinct from coalesce(new.email, '');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function private.handle_new_user();
create trigger on_auth_user_email_changed
  after update of email on auth.users for each row execute function private.handle_user_email_change();

-- ── Role changes: only admins, audited, never leaves zero admins ───────────
create or replace function private.guard_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and not private.is_admin() then
    raise exception 'role can only be changed by an administrator' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function private.guard_profile_role();

create or replace function private.admin_set_role(p_target uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.app_role;
begin
  if not private.is_admin() then raise exception 'administrator role required' using errcode = '42501'; end if;
  select role into v_old from public.profiles where id = p_target for update;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if v_old = 'admin' and p_role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'cannot remove the last administrator' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_target;
  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
  values ((select auth.uid()), 'role_changed', 'profile', p_target::text, jsonb_build_object('from', v_old, 'to', p_role));
end $$;

-- ── Application timeline ───────────────────────────────────────────────────
create or replace function private.log_application_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, kind, detail)
    values (new.id, 'created', 'Added to tracker as ' || new.status);
  else
    if new.status is distinct from old.status then
      insert into public.application_events (application_id, kind, detail)
      values (new.id, 'status_changed', old.status || ' -> ' || new.status);
    end if;
    if new.notes is distinct from old.notes then
      insert into public.application_events (application_id, kind, detail) values (new.id, 'note_added', 'Notes updated');
    end if;
    if new.next_action is distinct from old.next_action then
      insert into public.application_events (application_id, kind, detail)
      values (new.id, 'next_action_set', coalesce(new.next_action, 'Cleared'));
    end if;
    if new.reminder_at is distinct from old.reminder_at then
      insert into public.application_events (application_id, kind, detail)
      values (new.id, 'reminder_set', coalesce('Reminder set for ' || new.reminder_at::text, 'Reminder cleared'));
    end if;
  end if;
  return new;
end $$;
create trigger applications_log_events after insert or update on public.applications
  for each row execute function private.log_application_event();

-- ── Reviewer decisions ─────────────────────────────────────────────────────
create or replace function private.decide_review(p_review_id uuid, p_decision public.review_decision_kind, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_rev  public.reviews;
  v_idea public.ideas;
  v_dec  uuid;
begin
  if not private.is_reviewer() then raise exception 'reviewer role required' using errcode = '42501'; end if;
  select * into v_rev from public.reviews where id = p_review_id for update;
  if not found then raise exception 'review not found' using errcode = 'P0002'; end if;
  select * into v_idea from public.ideas where id = v_rev.idea_id;
  if v_idea.owner_id = v_uid then
    raise exception 'reviewers cannot decide on their own ideas' using errcode = '42501';
  end if;
  if v_rev.state = 'decided' then raise exception 'review already decided' using errcode = 'P0001'; end if;

  insert into public.review_decisions (review_id, reviewer_id, decision, note)
  values (p_review_id, v_uid, p_decision, nullif(btrim(p_note), '')) returning id into v_dec;

  if p_decision = 'needs_review' then          -- escalation: stays in the queue, history is kept
    update public.ideas set status = 'needs_review' where id = v_idea.id;
    update public.reviews set updated_at = now() where id = p_review_id;
  else
    update public.reviews set state = 'decided', decided_at = now() where id = p_review_id;
    update public.ideas set status = (case p_decision when 'confirm_overlap' then 'confirmed_overlap' else 'dismissed' end)::public.idea_status
     where id = v_idea.id;
    insert into public.notifications (student_id, kind, title, body, link, dedupe_key)
    values (v_idea.owner_id, 'reviewer_decision', 'A reviewer decided on your idea',
            format('"%s" was marked: %s.', v_idea.title,
                   case p_decision when 'confirm_overlap' then 'overlap confirmed' else 'dismissed - no overlap found' end),
            '/originality/history', 'review-decision:' || v_dec::text)
    on conflict do nothing;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_uid, 'review_decision', 'review', p_review_id::text, jsonb_build_object('decision', p_decision));
  return v_dec;
end $$;

-- ── Vector search over idea embeddings (pgvector, cosine) ──────────────────
create or replace function private.match_reference_ideas(p_embedding extensions.vector, p_model text, p_limit integer default 5)
returns table(idea_id uuid, title text, description text, source text, similarity double precision)
language plpgsql set search_path = 'public', 'extensions' as $$
#variable_conflict use_column
begin
  begin perform set_config('hnsw.iterative_scan', 'strict_order', true);   -- pgvector >= 0.8 only
  exception when others then null; end;
  return query
    select i.id, i.title, i.description, i.source,
           greatest(0::double precision, 1 - (e.embedding <=> p_embedding))
      from idea_embeddings e join ideas i on i.id = e.idea_id
     where e.model = p_model and i.kind = 'reference'
     order by e.embedding <=> p_embedding
     limit p_limit;
end $$;

create or replace function private.match_submission_overlaps(p_embedding extensions.vector, p_model text, p_exclude_owner uuid, p_limit integer default 3)
returns table(idea_id uuid, title text, similarity double precision)
language plpgsql set search_path = 'public', 'extensions' as $$
#variable_conflict use_column
begin
  begin perform set_config('hnsw.iterative_scan', 'strict_order', true);
  exception when others then null; end;
  return query
    select i.id, i.title, greatest(0::double precision, 1 - (e.embedding <=> p_embedding))
      from idea_embeddings e join ideas i on i.id = e.idea_id
     where e.model = p_model and i.kind = 'submission' and i.owner_id <> p_exclude_owner
     order by e.embedding <=> p_embedding
     limit p_limit;
end $$;

-- ── Team candidates: consent-gated (open_to_team) ──────────────────────────
create or replace function private.team_candidates(p_limit integer default 500)
returns table(id uuid, full_name text, experience_level public.skill_level, availability_hrs integer, skills text[], interests text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.experience_level, p.availability_hrs,
         coalesce((select array_agg(s.name order by s.name) from public.profile_skills ps
                    join public.skills s on s.id = ps.skill_id where ps.profile_id = p.id), '{}'::text[]),
         coalesce((select array_agg(i.name order by i.name) from public.profile_interests pi
                    join public.interests i on i.id = pi.interest_id where pi.profile_id = p.id), '{}'::text[])
    from public.profiles p
   where (select auth.uid()) is not null
     and p.open_to_team and p.role = 'student' and p.onboarding_completed
     and p.id <> (select auth.uid())
   order by p.created_at
   limit least(p_limit, 1000) $$;

-- ── Scheduled notification generators (dedupe_key makes them idempotent) ───
create or replace function private.generate_deadline_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with targets as (
    select s.student_id, o.id as opp_id, o.title, o.deadline
      from public.saved_opportunities s join public.opportunities o on o.id = s.opportunity_id
     where o.status = 'active' and o.deadline between current_date and current_date + 3
    union
    select a.student_id, o.id, o.title, o.deadline
      from public.applications a join public.opportunities o on o.id = a.opportunity_id
     where o.status = 'active' and o.deadline between current_date and current_date + 3
       and a.status in ('wishlist', 'saved', 'planning', 'applying')
  ), ins as (
    insert into public.notifications (student_id, kind, title, body, link, dedupe_key)
    select student_id, 'deadline_approaching', 'Deadline approaching: ' || left(title, 150),
           format('%s closes on %s (%s day(s) left).', title, deadline, deadline - current_date),
           '/opportunities/' || opp_id::text, 'deadline:' || opp_id::text || ':' || deadline::text
      from targets
    on conflict (student_id, dedupe_key) do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

create or replace function private.generate_application_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ins as (
    insert into public.notifications (student_id, kind, title, body, link, dedupe_key)
    select a.student_id, 'application_reminder', 'Reminder: ' || left(o.title, 170),
           coalesce(nullif(a.next_action, ''), 'You set a reminder for this application.'),
           '/applications', 'app-reminder:' || a.id::text || ':' || a.reminder_at::text
      from public.applications a join public.opportunities o on o.id = a.opportunity_id
     where a.reminder_at <= current_date
       and a.status not in ('selected', 'rejected', 'withdrawn')
    on conflict (student_id, dedupe_key) do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

create or replace function private.generate_profile_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ins as (
    insert into public.notifications (student_id, kind, title, body, link, dedupe_key)
    select p.id, 'profile_completion', 'Finish your profile to unlock recommendations',
           'Add your branch, skills and interests so NIRMAAN can rank opportunities for you.',
           '/profile', 'profile-completion'
      from public.profiles p
     where p.role = 'student' and p.created_at < now() - interval '2 days'
       and (p.branch is null
            or not exists (select 1 from public.profile_skills ps where ps.profile_id = p.id)
            or not exists (select 1 from public.profile_interests pi where pi.profile_id = p.id))
    on conflict (student_id, dedupe_key) do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

create or replace function private.run_scheduled_sql_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'deadlineReminders', private.generate_deadline_reminders(),
    'applicationReminders', private.generate_application_reminders(),
    'profileReminders', private.generate_profile_reminders());
end $$;
