-- ==============================================================================
-- SquirrelTrack — remove Google sign-in
-- ==============================================================================

-- Google auth is being removed from the app entirely. Drop the domain-gate
-- trigger and function added in 20260820000000_google_haverford_gate.sql.
drop trigger if exists on_auth_user_google_domain on auth.users;
drop function if exists public.enforce_google_domain();
