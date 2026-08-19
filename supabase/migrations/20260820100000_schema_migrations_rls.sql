-- ==============================================================================
-- SquirrelTrack — lock down the CLI's migration bookkeeping table
-- ==============================================================================

-- `supabase db push` records applied migrations in public.schema_migrations,
-- which puts it behind the auto-generated API. RLS with no policies makes it
-- inaccessible to anon/authenticated, and the revoke hides it from the API
-- surface entirely. The CLI connects as the table owner, which RLS does not
-- restrict, so `db push` keeps working.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
