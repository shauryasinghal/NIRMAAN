-- NEW. Originality analysis fields + full reviewer workflow.

alter type public.review_decision_kind add value if not exists 'approve';
alter type public.review_decision_kind add value if not exists 'request_changes';
alter type public.review_decision_kind add value if not exists 'escalate';
alter type public.review_decision_kind add value if not exists 'reject';
alter type public.idea_status          add value if not exists 'approved';
alter type public.idea_status          add value if not exists 'changes_requested';
alter type public.idea_status          add value if not exists 'rejected';
alter type public.review_state         add value if not exists 'escalated';

alter table public.ideas
  add column analysis       jsonb not null default '{}'::jsonb,
  add column confidence     text check (confidence in ('low', 'medium', 'high')),
  add column opportunity_id uuid references public.opportunities(id) on delete set null;
create index ideas_opportunity_idx on public.ideas (opportunity_id) where opportunity_id is not null;

alter table public.idea_matches add column overlap jsonb not null default '{}'::jsonb;

-- Replaces the baseline function (same signature). Legacy values keep working:
--   confirm_overlap -> idea 'confirmed_overlap', dismiss -> 'dismissed', needs_review -> stays queued.
-- New values: approve / request_changes / reject decide the review; escalate hands it to an admin.
-- Every call appends an immutable review_decisions row AND an audit_log row.
create or replace function private.decide_review(p_review_id uuid, p_decision public.review_decision_kind, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_rev   public.reviews;
  v_idea  public.ideas;
  v_dec   uuid;
  v_note  text := nullif(btrim(p_note), '');
  v_status text;
  v_label  text;
begin
  if not private.is_reviewer() then raise exception 'reviewer role required' using errcode = '42501'; end if;
  select * into v_rev from public.reviews where id = p_review_id for update;
  if not found then raise exception 'review not found' using errcode = 'P0002'; end if;
  select * into v_idea from public.ideas where id = v_rev.idea_id;
  if v_idea.owner_id = v_uid then
    raise exception 'reviewers cannot decide on their own ideas' using errcode = '42501';
  end if;
  if v_rev.state = 'decided' then raise exception 'review already decided' using errcode = 'P0001'; end if;
  if v_rev.state = 'escalated' and not private.is_admin() then
    raise exception 'escalated reviews can only be decided by an administrator' using errcode = '42501';
  end if;
  if p_decision::text in ('request_changes', 'reject') and v_note is null then
    raise exception 'a note is required for this decision' using errcode = '22023';
  end if;

  insert into public.review_decisions (review_id, reviewer_id, decision, note)
  values (p_review_id, v_uid, p_decision, v_note) returning id into v_dec;

  if p_decision::text in ('needs_review') then                  -- legacy escalation-in-place
    update public.ideas set status = 'needs_review' where id = v_idea.id;
    update public.reviews set updated_at = now() where id = p_review_id;
  elsif p_decision::text = 'escalate' then
    update public.reviews set state = 'escalated' where id = p_review_id;
    update public.ideas set status = 'needs_review' where id = v_idea.id;
  else
    v_status := case p_decision::text
      when 'confirm_overlap'  then 'confirmed_overlap'
      when 'dismiss'          then 'dismissed'
      when 'approve'          then 'approved'
      when 'request_changes'  then 'changes_requested'
      when 'reject'           then 'rejected' end;
    v_label := case p_decision::text
      when 'confirm_overlap'  then 'overlap confirmed'
      when 'dismiss'          then 'dismissed - no overlap found'
      when 'approve'          then 'approved'
      when 'request_changes'  then 'changes requested'
      when 'reject'           then 'rejected' end;
    update public.reviews set state = 'decided', decided_at = now() where id = p_review_id;
    execute format('update public.ideas set status = %L::public.idea_status where id = %L', v_status, v_idea.id);
    insert into public.notifications (student_id, kind, title, body, link, dedupe_key)
    values (v_idea.owner_id, 'reviewer_decision', 'A reviewer decided on your idea',
            format('"%s" was marked: %s.%s', v_idea.title, v_label, coalesce(' Reviewer note: ' || left(v_note, 400), '')),
            '/originality/history', 'review-decision:' || v_dec::text)
    on conflict do nothing;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, detail)
  values (v_uid, 'review_decision', 'review', p_review_id::text,
          jsonb_build_object('decision', p_decision, 'idea_id', v_idea.id, 'has_note', v_note is not null));
  return v_dec;
end $$;
