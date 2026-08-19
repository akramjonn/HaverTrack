-- ==============================================================================
-- SquirrelTrack — Master Database Schema & Security Policies
-- ==============================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- 1. Profiles & College Domain Validation
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  college_verified boolean not null default false,
  college_email text,
  full_name text,
  class_year integer,
  height_cm numeric,
  weight_kg numeric,
  age integer,
  activity_level text check (activity_level in ('sedentary', 'moderate', 'active')),
  units text not null default 'imperial' check (units in ('imperial', 'metric')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Domain Check Trigger: Validates @haverford.edu and @brynmawr.edu
create or replace function public.handle_user_signup()
returns trigger as $$
declare
  user_domain text;
begin
  user_domain := lower(split_part(new.email, '@', 2));
  
  insert into public.profiles (id, email, college_verified, college_email)
  values (
    new.id,
    new.email,
    user_domain in ('haverford.edu', 'brynmawr.edu'),
    case when user_domain in ('haverford.edu', 'brynmawr.edu') then new.email else null end
  );
  
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_user_signup();

-- 2. Daily Goals (With Wellbeing Hard Floor of 1200 kcal - §11)
create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('lose', 'maintain', 'gain', 'tracking')),
  calorie_target integer check (calorie_target is null or calorie_target >= 1200),
  protein_g integer check (protein_g is null or protein_g >= 0),
  carbs_g integer check (carbs_g is null or carbs_g >= 0),
  fat_g integer check (fat_g is null or fat_g >= 0),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

alter table public.daily_goals enable row level security;

create policy "Users can manage own goals"
  on public.daily_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Weight Tracking (§4 Screen 11)
create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_on date not null,
  weight_kg numeric not null check (weight_kg > 20 and weight_kg < 300),
  created_at timestamptz not null default now(),
  unique (user_id, recorded_on)
);

alter table public.weight_entries enable row level security;

create policy "Users can manage own weight entries"
  on public.weight_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Dining Locations & Nutrislice Menus
create table if not exists public.dining_locations (
  id text primary key, -- e.g. 'dining-location'
  nutrislice_id integer not null,
  name text not null,
  timezone text not null default 'America/New_York'
);

insert into public.dining_locations (id, nutrislice_id, name, timezone)
values ('dining-location', 64087, 'Haverford DC', 'America/New_York')
on conflict (id) do nothing;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  nutrislice_id integer not null,
  location_id text not null references public.dining_locations(id),
  meal_period text not null check (meal_period in ('breakfast', 'lunch', 'dinner', 'brunch')),
  served_date date not null,
  station_name text not null,
  station_id integer,
  dish_name text not null,
  description text,
  ingredients text,
  serving_size text,
  calories integer, -- can be null if unknown in Nutrislice
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  dietary_tags text[] default '{}',
  allergens text[] default '{}',
  synced_at timestamptz not null default now(),
  unique (nutrislice_id, meal_period, served_date)
);

create index if not exists idx_menu_items_date on public.menu_items(served_date, meal_period);
create index if not exists idx_menu_items_trgm on public.menu_items using gin (dish_name gin_trgm_ops);

alter table public.menu_items enable row level security;
create policy "Anyone authenticated can view menu items"
  on public.menu_items for select
  using (true);

-- 5. Meal Logs & Log Items
create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null, -- For offline idempotent replays
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null,
  meal_period text not null check (meal_period in ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  title text not null,
  total_calories integer not null default 0,
  total_protein_g numeric not null default 0,
  total_carbs_g numeric not null default 0,
  total_fat_g numeric not null default 0,
  photo_path text,
  source text not null check (source in ('manual', 'scan', 'menu')),
  created_at timestamptz not null default now(),
  unique (user_id, client_uuid)
);

create index if not exists idx_meal_logs_user_date on public.meal_logs(user_id, logged_date);

alter table public.meal_logs enable row level security;
create policy "Users can manage own meal logs"
  on public.meal_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.meal_log_items (
  id uuid primary key default gen_random_uuid(),
  meal_log_id uuid not null references public.meal_logs(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  portion numeric not null default 1.0,
  portion_unit text not null default 'serving',
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  is_estimate boolean not null default false,
  confidence_score numeric,
  created_at timestamptz not null default now()
);

alter table public.meal_log_items enable row level security;
create policy "Users can manage own meal log items"
  on public.meal_log_items for all
  using (
    exists (
      select 1 from public.meal_logs
      where meal_logs.id = meal_log_items.meal_log_id
      and meal_logs.user_id = auth.uid()
    )
  );

-- 6. User Favorites
create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dish_name text not null,
  nutrislice_id integer,
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  created_at timestamptz not null default now(),
  unique (user_id, dish_name)
);

alter table public.user_favorites enable row level security;
create policy "Users can manage own favorites"
  on public.user_favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
