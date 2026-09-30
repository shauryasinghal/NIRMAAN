-- NEW. (1) Users can delete their own behavioural signals (reset personalisation).
--      (2) SQL notification generators respect notification_preferences.

create policy user_events_delete on public.user_events for delete to authenticated using (student_id = (select auth.uid()));
grant delete on public.user_events to authenticated;

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
    select t.student_id, 'deadline_approaching', 'Deadline approaching: ' || left(t.title, 150),
           format('%s closes on %s (%s day(s) left).', t.title, t.deadline, t.deadline - current_date),
           '/opportunities/' || t.opp_id::text, 'deadline:' || t.opp_id::text || ':' || t.deadline::text
      from targets t left join public.notification_preferences np on np.student_id = t.student_id
     where coalesce(np.deadline, true)
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
      left join public.notification_preferences np on np.student_id = a.student_id
     where a.reminder_at <= current_date and a.status not in ('selected', 'rejected', 'withdrawn')
       and coalesce(np.deadline, true)
    on conflict (student_id, dedupe_key) do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;
