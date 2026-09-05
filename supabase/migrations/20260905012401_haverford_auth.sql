-- Applies to email/password and every OAuth provider, including direct Auth API
-- calls. The Google hd parameter is only an account-picker hint.
create or replace function public.is_college_domain(addr text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(btrim(addr) ~* '^[^[:space:]@]+@haverford\.edu$', false);
$$;

create or replace function public.enforce_haverford_domain()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_college_domain(new.email) then
    raise exception 'Registration requires an @haverford.edu email.' using errcode = '28000';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_haverford_domain() from public, anon, authenticated;

drop trigger if exists on_auth_user_google_domain on auth.users;
drop function if exists public.enforce_google_domain();
create trigger on_auth_user_haverford_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_haverford_domain();

-- Only Supabase's verified auth fields may grant college verification.
create or replace function public.handle_user_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, college_verified, college_email, full_name)
  values (
    new.id, new.email,
    public.is_college_domain(new.email) and new.email_confirmed_at is not null,
    case when public.is_college_domain(new.email) and new.email_confirmed_at is not null then new.email end,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  ) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_user_signup() from public, anon, authenticated;

create or replace function public.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
  set email = new.email,
      college_verified = public.is_college_domain(new.email) and new.email_confirmed_at is not null,
      college_email = case when public.is_college_domain(new.email) and new.email_confirmed_at is not null then new.email end,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;
revoke all on function public.sync_profile_from_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.sync_profile_from_auth();

-- Missing profiles are repaired on the server; clients cannot insert a row
-- containing their own role or verification flags.
drop policy if exists "Users can insert own profile" on public.profiles;

update public.profiles p
set college_verified = public.is_college_domain(u.email) and u.email_confirmed_at is not null,
    college_email = case when public.is_college_domain(u.email) and u.email_confirmed_at is not null then u.email end
from auth.users u where p.id = u.id;
