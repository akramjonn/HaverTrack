-- ==============================================================================
-- HaverTrack — update admin_require()'s error hint for the SquirrelTrack rename
-- ==============================================================================
-- 20260819010000_admin.sql's admin_require() returns a runtime error hint that
-- is surfaced directly to API callers ('This endpoint is restricted to
-- SquirrelTrack administrators.'). That is live, user-facing behavior, not a
-- cosmetic comment, so it gets fixed via a new create-or-replace here rather
-- than by editing the historical migration file. Everything else about the
-- function is byte-identical to the original definition.
-- ==============================================================================

create or replace function public.admin_require()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required'
      using errcode = '42501', hint = 'This endpoint is restricted to HaverTrack administrators.';
  end if;
end;
$$;
