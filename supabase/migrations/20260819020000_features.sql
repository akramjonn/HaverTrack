-- ==============================================================================
-- SquirrelTrack — Lane C (Cal AI parity feature set)
-- Water tracking, per-user preferences, micronutrients, meal health scores,
-- and an indexed menu search function.
-- Additive only: no existing column is dropped or retyped.
-- ==============================================================================

-- 1. Water tracking ------------------------------------------------------------
-- One row per sip/glass rather than a running daily total, so "undo" removes the
-- last thing the student actually tapped instead of guessing an amount.
create table if not exists public.water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null,
  ml integer not null check (ml > 0 and ml <= 3000),
  created_at timestamptz not null default now()
);

create index if not exists idx_water_entries_user_date
  on public.water_entries(user_id, logged_date);

alter table public.water_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'water_entries'
      and policyname = 'Users can manage own water entries'
  ) then
    create policy "Users can manage own water entries"
      on public.water_entries for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- 2. Per-user preferences ------------------------------------------------------
-- Targets that are not calorie goals live here so daily_goals keeps its single
-- responsibility (and its 1200 kcal wellbeing floor) untouched.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  water_target_ml integer not null default 2500
    check (water_target_ml >= 500 and water_target_ml <= 6000),
  -- Nullable on purpose: no goal weight is a valid, common state and must never
  -- be filled in with a guess.
  goal_weight_kg numeric check (goal_weight_kg is null or (goal_weight_kg > 30 and goal_weight_kg < 250)),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_preferences'
      and policyname = 'Users can manage own preferences'
  ) then
    create policy "Users can manage own preferences"
      on public.user_preferences for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- 3. Micronutrients on logged items -------------------------------------------
-- Nullable everywhere: "we do not know the fiber in this dish" and "this dish has
-- no fiber" are different facts and must not collapse into 0.
alter table public.meal_log_items add column if not exists fiber_g numeric;
alter table public.meal_log_items add column if not exists sugar_g numeric;
alter table public.meal_log_items add column if not exists sodium_mg numeric;
alter table public.meal_log_items add column if not exists saturated_fat_g numeric;

-- 4. Meal-level micronutrients & health score ---------------------------------
create table if not exists public.meal_log_nutrients (
  meal_log_id uuid primary key references public.meal_logs(id) on delete cascade,
  fiber_g numeric,
  sugar_g numeric,
  sodium_mg numeric,
  saturated_fat_g numeric,
  health_score integer check (health_score is null or (health_score >= 0 and health_score <= 100)),
  health_grade text check (health_grade is null or health_grade in ('A', 'B', 'C', 'D', 'E')),
  updated_at timestamptz not null default now()
);

alter table public.meal_log_nutrients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'meal_log_nutrients'
      and policyname = 'Users can manage own meal nutrients'
  ) then
    create policy "Users can manage own meal nutrients"
      on public.meal_log_nutrients for all
      using (
        exists (
          select 1 from public.meal_logs
          where meal_logs.id = meal_log_nutrients.meal_log_id
            and meal_logs.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.meal_logs
          where meal_logs.id = meal_log_nutrients.meal_log_id
            and meal_logs.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- 5. Saved meals / favourites --------------------------------------------------
-- user_favorites already exists but carried no serving context, so a re-log had
-- to guess the portion. These columns record what was actually saved.
alter table public.user_favorites add column if not exists serving_size text;
alter table public.user_favorites add column if not exists station_name text;
alter table public.user_favorites add column if not exists source text not null default 'menu';
alter table public.user_favorites add column if not exists last_logged_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_favorites_source_check'
  ) then
    alter table public.user_favorites
      add constraint user_favorites_source_check
      check (source in ('menu', 'manual', 'scan', 'barcode'));
  end if;
end $$;

create index if not exists idx_user_favorites_user on public.user_favorites(user_id);

-- 6. Menu search ---------------------------------------------------------------
-- Both predicates below are servable by idx_menu_items_trgm (gin_trgm_ops
-- supports `%` and ILIKE), so this stays an index scan as the menu grows.
-- SECURITY INVOKER (the default) keeps the caller's RLS in force.
create or replace function public.search_menu_items(
  q text,
  served_on date default null,
  max_results integer default 30
)
returns table (
  id uuid,
  nutrislice_id integer,
  meal_period text,
  served_date date,
  station_name text,
  dish_name text,
  serving_size text,
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  dietary_tags text[],
  allergens text[],
  score real
)
language sql
stable
set search_path = public
as $$
  select
    m.id,
    m.nutrislice_id,
    m.meal_period,
    m.served_date,
    m.station_name,
    m.dish_name,
    m.serving_size,
    m.calories,
    m.protein_g,
    m.carbs_g,
    m.fat_g,
    m.dietary_tags,
    m.allergens,
    similarity(m.dish_name, q) as score
  from public.menu_items m
  where length(btrim(q)) > 0
    and (served_on is null or m.served_date = served_on)
    and (m.dish_name % q or m.dish_name ilike '%' || q || '%')
  order by
    (m.dish_name ilike q || '%') desc,
    similarity(m.dish_name, q) desc,
    m.served_date asc,
    m.dish_name asc
  limit greatest(1, least(coalesce(max_results, 30), 100));
$$;

grant execute on function public.search_menu_items(text, date, integer) to authenticated, anon;
