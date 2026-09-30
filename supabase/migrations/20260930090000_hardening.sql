-- NEW (post-baseline). Security hardening found during the audit.

-- 1. Column-level write access: a student edits profile fields, never role/email/id.
revoke update on public.profiles from authenticated;
grant update (full_name, year, branch, experience_level, availability_hrs, open_to_team,
              onboarding_completed, onboarding_completed_at, participation_pref)
  on public.profiles to authenticated;

-- 2. Mark-as-read is the only notification write a client may perform.
grant update (read_at) on public.notifications to authenticated;

-- 3. Tables that had RLS but no policy: state the intent explicitly.
create policy idea_embeddings_deny_clients on public.idea_embeddings
  for all to authenticated using (false) with check (false);
create policy saved_search_hits_select on public.saved_search_hits for select to authenticated
  using (exists (select 1 from public.saved_searches s
                  where s.id = saved_search_hits.saved_search_id and s.student_id = (select auth.uid())));
grant select on public.saved_search_hits to authenticated;

-- 4. Append-only evidence: audit rows and reviewer decisions can never be edited or removed.
--    (The only permitted change is ON DELETE SET NULL on audit_log.actor_id when a profile is deleted.)
create or replace function private.block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'audit_log' and tg_op = 'UPDATE'
     and new.actor_id is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

create trigger audit_log_append_only        before update or delete on public.audit_log
  for each row execute function private.block_mutation();
create trigger review_decisions_append_only before update or delete on public.review_decisions
  for each row execute function private.block_mutation();

-- 5. Server-side audit helper (service_role only; called by the API for actions that
--    are not already audited inside a SECURITY DEFINER function).
create or replace function private.write_audit(p_actor uuid, p_action text, p_entity text, p_entity_id text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, detail) values (p_actor, p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb)) $$;
revoke execute on function private.write_audit(uuid, text, text, text, jsonb) from public;
grant  execute on function private.write_audit(uuid, text, text, text, jsonb) to service_role;
