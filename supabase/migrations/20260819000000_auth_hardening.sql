-- ==============================================================================
-- SquirrelTrack — Auth hardening, roles, onboarding state, meal photo storage
-- ==============================================================================

-- 1. Profile columns -----------------------------------------------------------

alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists last_active_at timestamptz;
alter table public.profiles add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;

-- The signup trigger normally creates this row, but a client that finds itself
-- without one must be able to self-heal rather than run profile-less.
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 2. Server-owned profile fields ----------------------------------------------
-- `college_verified`, `role` and `email` decide access and appear in admin
-- statistics, so they must never be settable by the client that owns the row.

create or replace function public.is_college_domain(addr text)
returns boolean as $$
  select lower(split_part(coalesce(addr, ''), '@', 2)) in ('haverford.edu', 'brynmawr.edu');
$$ language sql immutable;

create or replace function public.protect_profile_fields()
returns trigger as $$
begin
  new.email := old.email;
  new.role := old.role;
  new.college_verified := old.college_verified;
  new.college_email := old.college_email;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Verification follows the address on the auth account. Confirming a college
-- address through Supabase (signup or email change) is what flips the flag.
create or replace function public.sync_profile_from_auth()
returns trigger as $$
begin
  update public.profiles p
  set email = new.email,
      college_verified = public.is_college_domain(new.email),
      college_email = case
        when public.is_college_domain(new.email) then new.email
        else p.college_email
      end,
      updated_at = now()
  where p.id = new.id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_from_auth();

-- Carry the name collected at signup through to the profile.
create or replace function public.handle_user_signup()
returns trigger as $$
begin
  insert into public.profiles (id, email, college_verified, college_email, full_name)
  values (
    new.id,
    new.email,
    public.is_college_domain(new.email),
    case when public.is_college_domain(new.email) then new.email else null end,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. Admin predicate -----------------------------------------------------------
-- Security definer so it can read `profiles` without tripping that table's own
-- RLS, which would otherwise recurse.

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- 4. Meal photo storage --------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under `<user_id>/<filename>`, so the first path segment is the
-- ownership check.
drop policy if exists "Users read own meal photos" on storage.objects;
create policy "Users read own meal photos"
  on storage.objects for select
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload own meal photos" on storage.objects;
create policy "Users upload own meal photos"
  on storage.objects for insert
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own meal photos" on storage.objects;
create policy "Users delete own meal photos"
  on storage.objects for delete
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Menu visibility -----------------------------------------------------------
-- The original policy allowed anonymous reads; menus are for signed-in students.

drop policy if exists "Anyone authenticated can view menu items" on public.menu_items;
create policy "Authenticated users can view menu items"
  on public.menu_items for select
  to authenticated
  using (true);

alter table public.dining_locations enable row level security;
drop policy if exists "Authenticated users can view dining locations" on public.dining_locations;
create policy "Authenticated users can view dining locations"
  on public.dining_locations for select
  to authenticated
  using (true);

-- 6. Helper indexes for date-range reads --------------------------------------

create index if not exists idx_weight_entries_user_date
  on public.weight_entries(user_id, recorded_on);
create index if not exists idx_meal_log_items_log
  on public.meal_log_items(meal_log_id);
create index if not exists idx_profiles_created_at
  on public.profiles(created_at);
