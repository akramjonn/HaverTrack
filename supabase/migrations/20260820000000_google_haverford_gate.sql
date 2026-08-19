-- ==============================================================================
-- SquirrelTrack — Google sign-in restricted to @haverford.edu accounts
-- ==============================================================================

-- Google sign-ups must come from @haverford.edu accounts. Email/password
-- signup keeps its looser rule (any address; menus stay locked until a
-- college address is linked) — the OAuth gate exists because a Google
-- session implies an identity we can actually pin to a campus.
--
-- Raising in a BEFORE INSERT trigger aborts the OAuth transaction: the
-- auth.users row is never created and Supabase surfaces this message back
-- to the client as an error, which the app maps to friendly copy.
create or replace function public.enforce_google_domain()
returns trigger as $$
begin
  if new.raw_app_meta_data ->> 'provider' = 'google'
     and lower(split_part(new.email, '@', 2)) <> 'haverford.edu' then
    raise exception 'Google sign-in is limited to @haverford.edu accounts.'
      using errcode = '28000';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_google_domain on auth.users;
create trigger on_auth_user_google_domain
  before insert on auth.users
  for each row execute function public.enforce_google_domain();
