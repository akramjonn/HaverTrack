-- ==============================================================================
-- SquirrelTrack — fix protect_profile_fields to actually allow trusted writers
-- ==============================================================================

-- protect_profile_fields (20260819000000_auth_hardening.sql) was written to
-- stop the *client* API from self-promoting its own role, but a BEFORE UPDATE
-- trigger fires for every writer regardless of who they are — including a
-- direct `postgres` connection or the SQL editor. The original docs promised
-- "run this as the service role or postgres" would work; it silently did not
-- (the UPDATE succeeded and returned a row, but the trigger overwrote `role`
-- back to its old value before the write landed). Discovered when promoting
-- the first admin account.
--
-- Fix: only re-assert the protected fields when the writer is one of the
-- roles PostgREST actually uses on behalf of a logged-in client (`anon`,
-- `authenticated`). A direct `postgres` connection or `service_role` is a
-- trusted operator action and passes through untouched.
--
-- Critically: NOT `security definer`. That was the actual bug, not just the
-- missing role check — inside a security definer function, `current_user`
-- resolves to the function's *owner* (postgres, since that's who ran the
-- migration), not the caller, for as long as the function executes. Every
-- role check here was therefore comparing 'postgres' against the allow-list
-- regardless of who actually issued the UPDATE, so it silently let every
-- caller through — verified live: a simulated `authenticated`-role self
-- promotion (inside a rolled-back transaction, so it never touched real
-- data) went through unblocked under the security-definer version. This
-- trigger needs no elevated privileges — it only reassigns fields on the row
-- the caller already has permission to update — so security invoker (the
-- default) is both correct and sufficient.
create or replace function public.protect_profile_fields()
returns trigger as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.email := old.email;
    new.role := old.role;
    new.college_verified := old.college_verified;
    new.college_email := old.college_email;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql set search_path = public;
