-- NEW. Append-only tables still have to disappear when their parent does (deleting an idea or an
-- account cascades to review_decisions). A cascade runs inside the parent's RI trigger, so
-- pg_trigger_depth() > 1 there; a direct DELETE/UPDATE by any role has depth 1 and is still refused.
create or replace function private.block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and tg_table_name = 'review_decisions' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_table_name = 'audit_log' and tg_op = 'UPDATE'
     and new.actor_id is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
