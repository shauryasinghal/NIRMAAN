-- NEW. Events written by one UPDATE shared now() (= transaction start), so their order was arbitrary.
-- clock_timestamp() gives each event its own strictly increasing time.
create or replace function private.log_application_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, kind, detail, created_at)
    values (new.id, 'created', 'Added to tracker as ' || new.status, clock_timestamp());
  else
    if new.status is distinct from old.status then
      insert into public.application_events (application_id, kind, detail, created_at)
      values (new.id, 'status_changed', old.status || ' -> ' || new.status, clock_timestamp());
    end if;
    if new.notes is distinct from old.notes then
      insert into public.application_events (application_id, kind, detail, created_at) values (new.id, 'note_added', 'Notes updated', clock_timestamp());
    end if;
    if new.next_action is distinct from old.next_action then
      insert into public.application_events (application_id, kind, detail, created_at)
      values (new.id, 'next_action_set', coalesce(new.next_action, 'Cleared'), clock_timestamp());
    end if;
    if new.reminder_at is distinct from old.reminder_at then
      insert into public.application_events (application_id, kind, detail, created_at)
      values (new.id, 'reminder_set', coalesce('Reminder set for ' || new.reminder_at::text, 'Reminder cleared'), clock_timestamp());
    end if;
  end if;
  return new;
end $$;
