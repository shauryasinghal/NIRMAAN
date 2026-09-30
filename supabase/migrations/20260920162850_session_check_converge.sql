-- Lets the API reject access tokens whose Supabase session was revoked
-- (e.g. after sign-out) even though the JWT itself has not yet expired.
create or replace function private.session_is_active(p_session_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
     where s.id = p_session_id
       and s.user_id = p_user_id                             -- the session must belong to the token's subject
       and (s.not_after is null or s.not_after > now()));
$$;
revoke execute on function private.session_is_active(uuid, uuid) from public;
grant  execute on function private.session_is_active(uuid, uuid) to service_role;
