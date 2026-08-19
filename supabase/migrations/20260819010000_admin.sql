-- ==============================================================================
-- SquirrelTrack — Admin analytics console
-- ==============================================================================
-- Everything an admin can see goes through a security-definer RPC that calls
-- public.admin_require() first. There are deliberately NO broad admin SELECT
-- policies on profiles / meal_logs: the readable surface is exactly the columns
-- these functions return, which keeps student health data auditable.
--
-- Privacy line held by this file:
--   * meal_logs.photo_path is never selected by any function here.
--   * weight_entries is only ever counted, never read row-by-row.
--   * Reading a *named* user (admin_user_detail) writes an admin_audit_log row.
--
-- Idempotent and additive: safe to re-run.
-- ==============================================================================

-- 1. Helpers -------------------------------------------------------------------

-- The dining centre, the students and the `logged_date` a client writes are all
-- on campus time. Using the server's UTC current_date would roll "today" over at
-- 8pm local and quietly break streaks and "scans today".
create or replace function public.admin_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

comment on function public.admin_today() is
  'Current calendar date on campus (America/New_York). Admin statistics use this instead of current_date.';

-- Single choke point for the privilege check so every RPC fails the same way.
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
      using errcode = '42501', hint = 'This endpoint is restricted to SquirrelTrack administrators.';
  end if;
end;
$$;

-- 2. Audit log -----------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  subject_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_created_at
  on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_subject
  on public.admin_audit_log(subject_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;

-- Read and append only, and only for admins. No update/delete policy exists, so
-- the trail cannot be rewritten from the client under any role.
drop policy if exists "Admins read audit log" on public.admin_audit_log;
create policy "Admins read audit log"
  on public.admin_audit_log for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins append audit log" on public.admin_audit_log;
create policy "Admins append audit log"
  on public.admin_audit_log for insert
  to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

revoke all on public.admin_audit_log from anon;
grant select, insert on public.admin_audit_log to authenticated;

-- 3. Supporting indexes for the aggregate scans --------------------------------

create index if not exists idx_meal_logs_logged_date on public.meal_logs(logged_date);
create index if not exists idx_meal_logs_created_at on public.meal_logs(created_at);
create index if not exists idx_meal_logs_source_date on public.meal_logs(source, logged_date);
create index if not exists idx_menu_items_synced_at on public.menu_items(synced_at desc);
create index if not exists idx_daily_goals_user_effective
  on public.daily_goals(user_id, effective_from desc);

-- 4. Platform overview (KPI tiles) ---------------------------------------------

drop function if exists public.admin_overview();
create function public.admin_overview()
returns table (
  total_users bigint,
  college_verified_users bigint,
  onboarded_users bigint,
  new_users_7d bigint,
  new_users_30d bigint,
  active_today bigint,
  active_7d bigint,
  active_30d bigint,
  total_meals bigint,
  meals_today bigint,
  meals_7d bigint,
  meals_per_active_user_7d numeric,
  avg_calories_7d numeric,
  scan_share_30d numeric,
  menu_last_sync timestamptz,
  menu_null_calorie_pct numeric,
  audit_events_7d bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
begin
  perform public.admin_require();

  return query
  with u as (
    select
      count(*)::bigint as total_users,
      count(*) filter (where p.college_verified)::bigint as verified,
      count(*) filter (where p.onboarded_at is not null)::bigint as onboarded,
      count(*) filter (where p.created_at >= now() - interval '7 days')::bigint as new_7,
      count(*) filter (where p.created_at >= now() - interval '30 days')::bigint as new_30
    from public.profiles p
  ),
  m as (
    select
      count(*)::bigint as total_meals,
      count(*) filter (where ml.logged_date = v_today)::bigint as meals_today,
      count(*) filter (where ml.logged_date > v_today - 7 and ml.logged_date <= v_today)::bigint as meals_7,
      count(distinct ml.user_id) filter (where ml.logged_date = v_today)::bigint as active_today,
      count(distinct ml.user_id) filter (where ml.logged_date > v_today - 7 and ml.logged_date <= v_today)::bigint as active_7,
      count(distinct ml.user_id) filter (where ml.logged_date > v_today - 30 and ml.logged_date <= v_today)::bigint as active_30,
      count(*) filter (where ml.source = 'scan' and ml.logged_date > v_today - 30)::bigint as scans_30,
      count(*) filter (where ml.logged_date > v_today - 30)::bigint as meals_30
    from public.meal_logs ml
  ),
  cal as (
    -- Average of each active student's daily intake, not of every row, so a
    -- six-snack day and a one-meal day weigh the same.
    select round(avg(d.cals), 0) as avg_cal
    from (
      select ml.user_id, ml.logged_date, sum(ml.total_calories) as cals
      from public.meal_logs ml
      where ml.logged_date > v_today - 7 and ml.logged_date <= v_today
      group by ml.user_id, ml.logged_date
    ) d
  ),
  menu as (
    select
      max(mi.synced_at) as last_sync,
      count(*)::numeric as items,
      count(*) filter (where mi.calories is null)::numeric as null_cals
    from public.menu_items mi
    where mi.served_date >= v_today - 30
  ),
  audit as (
    select count(*)::bigint as events
    from public.admin_audit_log al
    where al.created_at >= now() - interval '7 days'
  )
  select
    u.total_users,
    u.verified,
    u.onboarded,
    u.new_7,
    u.new_30,
    m.active_today,
    m.active_7,
    m.active_30,
    m.total_meals,
    m.meals_today,
    m.meals_7,
    case when m.active_7 = 0 then 0 else round(m.meals_7::numeric / m.active_7, 1) end,
    coalesce(cal.avg_cal, 0),
    case when m.meals_30 = 0 then 0 else round(100.0 * m.scans_30 / m.meals_30, 1) end,
    menu.last_sync,
    case when coalesce(menu.items, 0) = 0 then 0 else round(100.0 * menu.null_cals / menu.items, 1) end,
    audit.events
  from u, m, cal, menu, audit;
end;
$$;

-- 5. Activation funnel ---------------------------------------------------------
-- Each step is counted independently rather than nested. A later step that is
-- taller than an earlier one is a real signal worth seeing (e.g. Supabase email
-- confirmation switched off) and nesting would hide it.

drop function if exists public.admin_funnel();
create function public.admin_funnel()
returns table (
  step_order int,
  step_key text,
  step_label text,
  user_count bigint,
  pct_of_signups numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.admin_require();

  return query
  with base as (
    select
      p.id,
      au.email_confirmed_at,
      p.onboarded_at,
      (
        select count(distinct ml.logged_date)
        from public.meal_logs ml
        where ml.user_id = p.id
      ) as day_count
    from public.profiles p
    left join auth.users au on au.id = p.id
  ),
  totals as (
    select count(*)::bigint as signups from base
  ),
  steps as (
              select 1::int as step_order, 'signed_up'::text as step_key,
                     'Signed up'::text as step_label,
                     (select t.signups from totals t) as user_count
    union all select 2, 'email_verified', 'Email verified',
                     (select count(*)::bigint from base b where b.email_confirmed_at is not null)
    union all select 3, 'onboarded', 'Onboarding complete',
                     (select count(*)::bigint from base b where b.onboarded_at is not null)
    union all select 4, 'first_meal', 'Logged first meal',
                     (select count(*)::bigint from base b where b.day_count >= 1)
    union all select 5, 'habit', 'Logged on 3+ days',
                     (select count(*)::bigint from base b where b.day_count >= 3)
  )
  select
    s.step_order,
    s.step_key,
    s.step_label,
    s.user_count,
    case when t.signups = 0 then 0 else round(100.0 * s.user_count / t.signups, 1) end
  from steps s
  cross join totals t
  order by s.step_order;
end;
$$;

-- 6. Platform trend ------------------------------------------------------------

drop function if exists public.admin_platform_trend(int);
create function public.admin_platform_trend(p_days int default 30)
returns table (
  day date,
  new_signups bigint,
  dau bigint,
  wau bigint,
  meals_logged bigint,
  scan_meals bigint,
  menu_meals bigint,
  manual_meals bigint,
  avg_calories_per_active_user numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  perform public.admin_require();

  return query
  with days as (
    select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as d
  ),
  signups as (
    select (p.created_at at time zone 'America/New_York')::date as d, count(*)::bigint as n
    from public.profiles p
    group by 1
  ),
  logs as (
    select
      ml.logged_date as d,
      count(*)::bigint as meals,
      count(distinct ml.user_id)::bigint as dau,
      count(*) filter (where ml.source = 'scan')::bigint as scans,
      count(*) filter (where ml.source = 'menu')::bigint as menus,
      count(*) filter (where ml.source = 'manual')::bigint as manuals,
      sum(ml.total_calories)::numeric as cals
    from public.meal_logs ml
    group by ml.logged_date
  )
  select
    d.d,
    coalesce(s.n, 0),
    coalesce(l.dau, 0),
    (
      select count(distinct w.user_id)::bigint
      from public.meal_logs w
      where w.logged_date > d.d - 7 and w.logged_date <= d.d
    ),
    coalesce(l.meals, 0),
    coalesce(l.scans, 0),
    coalesce(l.menus, 0),
    coalesce(l.manuals, 0),
    case when coalesce(l.dau, 0) = 0 then 0 else round(l.cals / l.dau, 0) end
  from days d
  left join signups s on s.d = d.d
  left join logs l on l.d = d.d
  order by d.d;
end;
$$;

-- 7. Per-user roster -----------------------------------------------------------

drop function if exists public.admin_user_roster(text, int, int);
create function public.admin_user_roster(
  p_search text default null,
  p_limit int default 500,
  p_offset int default 0
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  joined_at timestamptz,
  college_verified boolean,
  class_year int,
  onboarded_at timestamptz,
  last_active_at timestamptz,
  email_confirmed_at timestamptz,
  total_meals bigint,
  days_logged bigint,
  meals_7d bigint,
  avg_calories_7d numeric,
  avg_calories_30d numeric,
  current_streak int,
  scans_today bigint,
  weight_entry_count bigint,
  goal_type text,
  calorie_target int,
  last_logged_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.admin_require();

  return query
  with day_rows as (
    select distinct ml.user_id, ml.logged_date from public.meal_logs ml
  ),
  latest as (
    select dr.user_id, max(dr.logged_date) as last_day, count(*)::bigint as days_logged
    from day_rows dr
    group by dr.user_id
  ),
  -- Gaps-and-islands: consecutive descending dates share `grp`, so the island
  -- that contains the most recent day is the live streak.
  islands as (
    select
      dr.user_id,
      (dr.logged_date + (row_number() over (partition by dr.user_id order by dr.logged_date desc)) * interval '1 day')::date as grp
    from day_rows dr
  ),
  streaks as (
    select i.user_id, count(*)::int as streak
    from islands i
    join latest l on l.user_id = i.user_id
    where l.last_day >= v_today - 1
      and i.grp = (l.last_day + interval '1 day')::date
    group by i.user_id
  ),
  meal_stats as (
    select
      ml.user_id,
      count(*)::bigint as total_meals,
      count(*) filter (where ml.logged_date > v_today - 7 and ml.logged_date <= v_today)::bigint as meals_7d,
      count(*) filter (where ml.source = 'scan' and ml.logged_date = v_today)::bigint as scans_today
    from public.meal_logs ml
    group by ml.user_id
  ),
  cal7 as (
    select d.user_id, round(avg(d.cals), 0) as avg_cal
    from (
      select ml.user_id, ml.logged_date, sum(ml.total_calories) as cals
      from public.meal_logs ml
      where ml.logged_date > v_today - 7 and ml.logged_date <= v_today
      group by ml.user_id, ml.logged_date
    ) d
    group by d.user_id
  ),
  cal30 as (
    select d.user_id, round(avg(d.cals), 0) as avg_cal
    from (
      select ml.user_id, ml.logged_date, sum(ml.total_calories) as cals
      from public.meal_logs ml
      where ml.logged_date > v_today - 30 and ml.logged_date <= v_today
      group by ml.user_id, ml.logged_date
    ) d
    group by d.user_id
  ),
  weights as (
    select we.user_id, count(*)::bigint as n from public.weight_entries we group by we.user_id
  ),
  goals as (
    select distinct on (g.user_id) g.user_id, g.goal_type, g.calorie_target
    from public.daily_goals g
    order by g.user_id, g.effective_from desc
  )
  select
    p.id,
    p.full_name,
    p.email,
    p.created_at,
    p.college_verified,
    p.class_year,
    p.onboarded_at,
    p.last_active_at,
    au.email_confirmed_at,
    coalesce(ms.total_meals, 0),
    coalesce(l.days_logged, 0),
    coalesce(ms.meals_7d, 0),
    coalesce(c7.avg_cal, 0),
    coalesce(c30.avg_cal, 0),
    coalesce(st.streak, 0),
    coalesce(ms.scans_today, 0),
    coalesce(w.n, 0),
    g.goal_type,
    g.calorie_target,
    l.last_day
  from public.profiles p
  left join auth.users au on au.id = p.id
  left join latest l on l.user_id = p.id
  left join streaks st on st.user_id = p.id
  left join meal_stats ms on ms.user_id = p.id
  left join cal7 c7 on c7.user_id = p.id
  left join cal30 c30 on c30.user_id = p.id
  left join weights w on w.user_id = p.id
  left join goals g on g.user_id = p.id
  where v_search is null
     or p.email ilike '%' || v_search || '%'
     or coalesce(p.full_name, '') ilike '%' || v_search || '%'
  order by p.created_at desc
  limit v_limit offset v_offset;
end;
$$;

-- 8. Single-user detail (audited) ---------------------------------------------
-- Volatile on purpose: opening a named student's record writes the audit row,
-- so the log cannot be bypassed by calling a "read-only" variant.

drop function if exists public.admin_user_detail(uuid);
create function public.admin_user_detail(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  joined_at timestamptz,
  email_confirmed_at timestamptz,
  college_verified boolean,
  college_email text,
  class_year int,
  units text,
  role text,
  onboarded_at timestamptz,
  last_active_at timestamptz,
  goal_type text,
  calorie_target int,
  protein_g int,
  carbs_g int,
  fat_g int,
  total_meals bigint,
  days_logged bigint,
  meals_7d bigint,
  meals_30d bigint,
  avg_calories_7d numeric,
  avg_calories_30d numeric,
  current_streak int,
  first_logged_date date,
  last_logged_date date,
  scan_meals bigint,
  menu_meals bigint,
  manual_meals bigint,
  weight_entry_count bigint,
  favorite_count bigint
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
begin
  perform public.admin_require();

  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;

  insert into public.admin_audit_log (admin_id, action, subject_user_id)
  values (auth.uid(), 'view_user_detail', p_user_id);

  return query
  with day_rows as (
    select distinct ml.logged_date
    from public.meal_logs ml
    where ml.user_id = p_user_id
  ),
  islands as (
    select
      dr.logged_date,
      (dr.logged_date + (row_number() over (order by dr.logged_date desc)) * interval '1 day')::date as grp
    from day_rows dr
  ),
  bounds as (
    select min(dr.logged_date) as first_day, max(dr.logged_date) as last_day, count(*)::bigint as days_logged
    from day_rows dr
  ),
  streak as (
    select coalesce((
      select count(*)::int
      from islands i, bounds b
      where b.last_day >= v_today - 1
        and i.grp = (b.last_day + interval '1 day')::date
    ), 0) as n
  ),
  ms as (
    select
      count(*)::bigint as total_meals,
      count(*) filter (where ml.logged_date > v_today - 7 and ml.logged_date <= v_today)::bigint as meals_7d,
      count(*) filter (where ml.logged_date > v_today - 30 and ml.logged_date <= v_today)::bigint as meals_30d,
      count(*) filter (where ml.source = 'scan')::bigint as scan_meals,
      count(*) filter (where ml.source = 'menu')::bigint as menu_meals,
      count(*) filter (where ml.source = 'manual')::bigint as manual_meals
    from public.meal_logs ml
    where ml.user_id = p_user_id
  ),
  cal7 as (
    select round(avg(d.cals), 0) as avg_cal from (
      select ml.logged_date, sum(ml.total_calories) as cals
      from public.meal_logs ml
      where ml.user_id = p_user_id and ml.logged_date > v_today - 7 and ml.logged_date <= v_today
      group by ml.logged_date
    ) d
  ),
  cal30 as (
    select round(avg(d.cals), 0) as avg_cal from (
      select ml.logged_date, sum(ml.total_calories) as cals
      from public.meal_logs ml
      where ml.user_id = p_user_id and ml.logged_date > v_today - 30 and ml.logged_date <= v_today
      group by ml.logged_date
    ) d
  ),
  g as (
    select dg.goal_type, dg.calorie_target, dg.protein_g, dg.carbs_g, dg.fat_g
    from public.daily_goals dg
    where dg.user_id = p_user_id
    order by dg.effective_from desc
    limit 1
  )
  select
    p.id,
    p.full_name,
    p.email,
    p.created_at,
    au.email_confirmed_at,
    p.college_verified,
    p.college_email,
    p.class_year,
    p.units,
    p.role,
    p.onboarded_at,
    p.last_active_at,
    g.goal_type,
    g.calorie_target,
    g.protein_g,
    g.carbs_g,
    g.fat_g,
    coalesce(ms.total_meals, 0),
    coalesce(b.days_logged, 0),
    coalesce(ms.meals_7d, 0),
    coalesce(ms.meals_30d, 0),
    coalesce(cal7.avg_cal, 0),
    coalesce(cal30.avg_cal, 0),
    coalesce(streak.n, 0),
    b.first_day,
    b.last_day,
    coalesce(ms.scan_meals, 0),
    coalesce(ms.menu_meals, 0),
    coalesce(ms.manual_meals, 0),
    (select count(*)::bigint from public.weight_entries we where we.user_id = p_user_id),
    (select count(*)::bigint from public.user_favorites uf where uf.user_id = p_user_id)
  from public.profiles p
  left join auth.users au on au.id = p.id
  cross join bounds b
  cross join streak
  cross join ms
  cross join cal7
  cross join cal30
  left join g on true
  where p.id = p_user_id;
end;
$$;

-- Engagement series for one student. Deliberately meal *counts* only — a named
-- student's day-by-day calorie history is not something an admin needs, and the
-- 7d/30d averages above already answer "is this plan working".
drop function if exists public.admin_user_activity(uuid, int);
create function public.admin_user_activity(p_user_id uuid, p_days int default 30)
returns table (
  day date,
  meals bigint,
  scan_meals bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  perform public.admin_require();

  return query
  with days as (
    select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as d
  ),
  logs as (
    select
      ml.logged_date as d,
      count(*)::bigint as n,
      count(*) filter (where ml.source = 'scan')::bigint as scans
    from public.meal_logs ml
    where ml.user_id = p_user_id
    group by ml.logged_date
  )
  select d.d, coalesce(l.n, 0), coalesce(l.scans, 0)
  from days d
  left join logs l on l.d = d.d
  order by d.d;
end;
$$;

-- 9. Content health ------------------------------------------------------------

drop function if exists public.admin_content_summary();
create function public.admin_content_summary()
returns table (
  last_sync timestamptz,
  hours_since_sync numeric,
  total_items bigint,
  null_calorie_items bigint,
  null_calorie_pct numeric,
  earliest_date date,
  latest_date date,
  days_covered bigint,
  days_ahead int,
  items_today bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
begin
  perform public.admin_require();

  return query
  select
    max(mi.synced_at),
    round(extract(epoch from (now() - max(mi.synced_at))) / 3600.0, 1),
    count(*)::bigint,
    count(*) filter (where mi.calories is null)::bigint,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where mi.calories is null) / count(*), 1) end,
    min(mi.served_date),
    max(mi.served_date),
    count(distinct mi.served_date)::bigint,
    greatest(coalesce(max(mi.served_date), v_today) - v_today, 0)::int,
    count(*) filter (where mi.served_date = v_today)::bigint
  from public.menu_items mi;
end;
$$;

drop function if exists public.admin_content_daily(int);
create function public.admin_content_daily(p_days int default 14)
returns table (
  served_date date,
  meal_period text,
  item_count bigint,
  null_calorie_items bigint,
  null_calorie_pct numeric,
  last_synced timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
  v_days int := least(greatest(coalesce(p_days, 14), 1), 120);
begin
  perform public.admin_require();

  return query
  select
    mi.served_date,
    mi.meal_period,
    count(*)::bigint,
    count(*) filter (where mi.calories is null)::bigint,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where mi.calories is null) / count(*), 1) end,
    max(mi.synced_at)
  from public.menu_items mi
  where mi.served_date >= v_today - v_days
    and mi.served_date <= v_today + 14
  group by mi.served_date, mi.meal_period
  order by mi.served_date desc, mi.meal_period;
end;
$$;

-- 10. Engagement ---------------------------------------------------------------

drop function if exists public.admin_top_dishes(int, int);
create function public.admin_top_dishes(p_days int default 30, p_limit int default 10)
returns table (
  dish_name text,
  log_count bigint,
  user_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  perform public.admin_require();

  return query
  select
    min(mli.name) as dish_name,
    count(*)::bigint,
    count(distinct ml.user_id)::bigint
  from public.meal_log_items mli
  join public.meal_logs ml on ml.id = mli.meal_log_id
  where ml.logged_date > v_today - v_days and ml.logged_date <= v_today
  group by lower(btrim(mli.name))
  order by count(*) desc, min(mli.name)
  limit v_limit;
end;
$$;

drop function if exists public.admin_top_stations(int, int);
create function public.admin_top_stations(p_days int default 30, p_limit int default 10)
returns table (
  station_name text,
  log_count bigint,
  user_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := public.admin_today();
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  perform public.admin_require();

  return query
  select
    mi.station_name,
    count(*)::bigint,
    count(distinct ml.user_id)::bigint
  from public.meal_log_items mli
  join public.meal_logs ml on ml.id = mli.meal_log_id
  join public.menu_items mi on mi.id = mli.menu_item_id
  where ml.logged_date > v_today - v_days and ml.logged_date <= v_today
  group by mi.station_name
  order by count(*) desc, mi.station_name
  limit v_limit;
end;
$$;

drop function if exists public.admin_peak_hours(int);
create function public.admin_peak_hours(p_days int default 30)
returns table (
  hour_of_day int,
  log_count bigint,
  user_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  perform public.admin_require();

  return query
  with hours as (
    select generate_series(0, 23) as h
  ),
  logs as (
    select
      extract(hour from (ml.created_at at time zone 'America/New_York'))::int as h,
      count(*)::bigint as n,
      count(distinct ml.user_id)::bigint as u
    from public.meal_logs ml
    where ml.created_at >= now() - (v_days || ' days')::interval
    group by 1
  )
  select hours.h, coalesce(l.n, 0), coalesce(l.u, 0)
  from hours
  left join logs l on l.h = hours.h
  order by hours.h;
end;
$$;

-- 11. Audit trail readback -----------------------------------------------------

drop function if exists public.admin_audit_recent(int);
create function public.admin_audit_recent(p_limit int default 25)
returns table (
  id uuid,
  created_at timestamptz,
  action text,
  admin_email text,
  subject_user_id uuid,
  subject_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 200);
begin
  perform public.admin_require();

  return query
  select
    al.id,
    al.created_at,
    al.action,
    admin_p.email,
    al.subject_user_id,
    subject_p.email
  from public.admin_audit_log al
  left join public.profiles admin_p on admin_p.id = al.admin_id
  left join public.profiles subject_p on subject_p.id = al.subject_user_id
  order by al.created_at desc
  limit v_limit;
end;
$$;

-- 12. Grants -------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on new functions, which would expose these
-- to `anon` through PostgREST. Revoke first, then hand execute to `authenticated`
-- only; admin_require() is what actually enforces the role.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_today', 'admin_require', 'admin_overview', 'admin_funnel',
        'admin_platform_trend', 'admin_user_roster', 'admin_user_detail',
        'admin_user_activity', 'admin_content_summary', 'admin_content_daily',
        'admin_top_dishes', 'admin_top_stations', 'admin_peak_hours',
        'admin_audit_recent'
      )
  loop
    execute format('revoke all on function %s from public', fn.sig);
    execute format('revoke all on function %s from anon', fn.sig);
    execute format('grant execute on function %s to authenticated', fn.sig);
  end loop;
end $$;

-- PostgREST caches the schema; without this the new RPCs 404 until it reloads.
notify pgrst, 'reload schema';
