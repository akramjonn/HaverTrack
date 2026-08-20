-- ==============================================================================
-- SquirrelTrack — close the identity-linking bypass in the Haverford Google gate
-- ==============================================================================

-- `enforce_google_domain` (20260820000000) fires BEFORE INSERT ON auth.users,
-- which covers exactly one route in: a brand-new user whose first-ever sign-in
-- is Google. It does not cover the second route, and the second route is open.
--
-- Linking a Google account to an existing user inserts into auth.identities and
-- never touches auth.users, so no trigger on auth.users can see it. GoTrue links
-- automatically whenever a Google sign-in presents an email that already belongs
-- to a confirmed account. The full bypass is therefore:
--
--   1. Sign up with email/password as anyone@gmail.com. This is deliberately
--      allowed — the email/password path takes any address and simply keeps
--      menus locked until a college address is linked.
--   2. Confirm the address.
--   3. "Sign in with Google" as the same anyone@gmail.com.
--   4. GoTrue attaches a google identity to the existing row. auth.users is
--      only UPDATEd, so enforce_google_domain never runs, and the account now
--      has working Google sign-in that the domain gate never evaluated.
--
-- This is not hypothetical: the project's own account reached that state, with
-- app_metadata.providers = ["email","google"] and provider still "email"
-- because provider records the *first* one. That was a legitimate Haverford
-- address, but nothing in the schema required it to be.
--
-- Guarding the identity insert is what actually closes it, so the rule now sits
-- on the table the linking writes to.
create or replace function public.enforce_google_identity_domain()
returns trigger as $$
declare
  identity_email text;
begin
  if new.provider <> 'google' then
    return new;
  end if;

  -- Read identity_data, not new.email: auth.identities.email is GENERATED
  -- ALWAYS from identity_data ->> 'email', and a generated column is not
  -- guaranteed to be computed yet in a BEFORE INSERT trigger.
  identity_email := lower(new.identity_data ->> 'email');

  -- A google identity with no email at all cannot be proven to be Haverford's,
  -- and refusing it is the safe direction: the gate exists to keep non-campus
  -- accounts out, so an unverifiable one is a rejection rather than a pass.
  if identity_email is null
     or split_part(identity_email, '@', 2) <> 'haverford.edu' then
    raise exception 'Google sign-in is limited to @haverford.edu accounts.'
      using errcode = '28000';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_identity_google_domain on auth.identities;
create trigger on_auth_identity_google_domain
  before insert on auth.identities
  for each row execute function public.enforce_google_identity_domain();

-- The auth.users trigger stays as the first line of defence for the Google-first
-- signup, but its provider test is widened. `raw_app_meta_data ->> 'provider'`
-- holds only the first provider ever used, so a row can carry
-- providers = ["email","google"] while provider still reads "email". Checking
-- the array as well means the users-level gate cannot be sidestepped by a row
-- that arrives already carrying google among its providers.
create or replace function public.enforce_google_domain()
returns trigger as $$
begin
  if (new.raw_app_meta_data ->> 'provider' = 'google'
      or new.raw_app_meta_data -> 'providers' ? 'google')
     and lower(split_part(new.email, '@', 2)) <> 'haverford.edu' then
    raise exception 'Google sign-in is limited to @haverford.edu accounts.'
      using errcode = '28000';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
