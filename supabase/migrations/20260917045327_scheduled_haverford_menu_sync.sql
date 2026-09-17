begin;

create table public.menu_sync_status (
  singleton boolean primary key default true check (singleton),
  last_attempt_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_item_count integer check (last_item_count is null or last_item_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.menu_sync_runs (
  id uuid primary key,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  success boolean not null,
  item_count integer check (item_count is null or item_count >= 0),
  deleted_count integer check (deleted_count is null or deleted_count >= 0),
  error_details jsonb
);

create index menu_sync_runs_completed_at_idx
  on public.menu_sync_runs (completed_at desc);

alter table public.menu_sync_status enable row level security;
alter table public.menu_sync_runs enable row level security;
revoke all on public.menu_sync_status, public.menu_sync_runs from public, anon, authenticated;

create or replace function private.apply_haverford_menu_sync(
  p_run_id uuid,
  p_started_at timestamptz,
  p_items jsonb,
  p_scopes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  upserted_count integer;
  removed_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Refusing to replace the menu with an empty payload';
  end if;
  if jsonb_typeof(p_scopes) <> 'array' or jsonb_array_length(p_scopes) = 0 then
    raise exception 'At least one successfully fetched menu scope is required';
  end if;

  -- Serialize syncs so two scheduled/manual invocations cannot reconcile the
  -- same dates concurrently. The lock is released with this transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('haverford-menu-sync'));

  insert into public.dining_locations (id, nutrislice_id, name, timezone)
  values ('dining-location', 64087, 'Haverford DC', 'America/New_York')
  on conflict (id) do update set
    nutrislice_id = excluded.nutrislice_id,
    name = excluded.name,
    timezone = excluded.timezone;

  insert into public.menu_items (
    nutrislice_id, location_id, meal_period, served_date, station_name,
    station_id, dish_name, description, ingredients, serving_size, calories,
    protein_g, carbs_g, fat_g, dietary_tags, allergens, synced_at
  )
  select
    item.nutrislice_id, item.location_id, item.meal_period, item.served_date,
    item.station_name, item.station_id, item.dish_name, item.description,
    item.ingredients, item.serving_size, item.calories, item.protein_g,
    item.carbs_g, item.fat_g, item.dietary_tags, item.allergens, item.synced_at
  from jsonb_to_recordset(p_items) as item(
    nutrislice_id integer,
    location_id text,
    meal_period text,
    served_date date,
    station_name text,
    station_id integer,
    dish_name text,
    description text,
    ingredients text,
    serving_size text,
    calories integer,
    protein_g numeric,
    carbs_g numeric,
    fat_g numeric,
    dietary_tags text[],
    allergens text[],
    synced_at timestamptz
  )
  on conflict (nutrislice_id, meal_period, served_date) do update set
    location_id = excluded.location_id,
    station_name = excluded.station_name,
    station_id = excluded.station_id,
    dish_name = excluded.dish_name,
    description = excluded.description,
    ingredients = excluded.ingredients,
    serving_size = excluded.serving_size,
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    dietary_tags = excluded.dietary_tags,
    allergens = excluded.allergens,
    synced_at = excluded.synced_at;
  get diagnostics upserted_count = row_count;

  delete from public.menu_items as existing
  where existing.location_id = 'dining-location'
    and exists (
      select 1
      from jsonb_to_recordset(p_scopes) as scope(served_date date, meal_period text)
      where scope.served_date = existing.served_date
        and scope.meal_period = existing.meal_period
    )
    and not exists (
      select 1
      from jsonb_to_recordset(p_items) as incoming(
        nutrislice_id integer,
        served_date date,
        meal_period text
      )
      where incoming.nutrislice_id = existing.nutrislice_id
        and incoming.served_date = existing.served_date
        and incoming.meal_period = existing.meal_period
    );
  get diagnostics removed_count = row_count;

  insert into public.menu_sync_runs (
    id, started_at, success, item_count, deleted_count
  ) values (
    p_run_id, p_started_at, true, upserted_count, removed_count
  );

  insert into public.menu_sync_status (
    singleton, last_attempt_at, last_successful_sync_at, last_error,
    consecutive_failures, last_item_count, updated_at
  ) values (
    true, now(), now(), null, 0, upserted_count, now()
  )
  on conflict (singleton) do update set
    last_attempt_at = excluded.last_attempt_at,
    last_successful_sync_at = excluded.last_successful_sync_at,
    last_error = null,
    consecutive_failures = 0,
    last_item_count = excluded.last_item_count,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'upserted', upserted_count,
    'deleted', removed_count,
    'last_successful_sync_at', now()
  );
end;
$$;

create or replace function public.apply_haverford_menu_sync(
  p_run_id uuid,
  p_started_at timestamptz,
  p_items jsonb,
  p_scopes jsonb
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.apply_haverford_menu_sync(
    p_run_id, p_started_at, p_items, p_scopes
  )
$$;

create or replace function private.record_haverford_menu_sync_failure(
  p_run_id uuid,
  p_started_at timestamptz,
  p_error text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.menu_sync_runs (
    id, started_at, success, error_details
  ) values (
    p_run_id, p_started_at, false, jsonb_build_object('message', left(p_error, 4000))
  );

  insert into public.menu_sync_status (
    singleton, last_attempt_at, last_error, consecutive_failures, updated_at
  ) values (
    true, now(), left(p_error, 4000), 1, now()
  )
  on conflict (singleton) do update set
    last_attempt_at = excluded.last_attempt_at,
    last_error = excluded.last_error,
    consecutive_failures = public.menu_sync_status.consecutive_failures + 1,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.record_haverford_menu_sync_failure(
  p_run_id uuid,
  p_started_at timestamptz,
  p_error text
) returns void
language sql
security invoker
set search_path = ''
as $$
  select private.record_haverford_menu_sync_failure(p_run_id, p_started_at, p_error)
$$;

revoke all on function private.apply_haverford_menu_sync(uuid,timestamptz,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.apply_haverford_menu_sync(uuid,timestamptz,jsonb,jsonb) from public, anon, authenticated;
revoke all on function private.record_haverford_menu_sync_failure(uuid,timestamptz,text) from public, anon, authenticated;
revoke all on function public.record_haverford_menu_sync_failure(uuid,timestamptz,text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.apply_haverford_menu_sync(uuid,timestamptz,jsonb,jsonb) to service_role;
grant execute on function public.apply_haverford_menu_sync(uuid,timestamptz,jsonb,jsonb) to service_role;
grant execute on function private.record_haverford_menu_sync_failure(uuid,timestamptz,text) to service_role;
grant execute on function public.record_haverford_menu_sync_failure(uuid,timestamptz,text) to service_role;

-- The setup script creates the Vault secret and this named job after the Edge
-- Function is deployed. Keeping deployment-specific values out of migrations
-- means local resets remain deterministic and secrets never enter git.

insert into public.schema_migrations(version)
values ('20260917045327_scheduled_haverford_menu_sync.sql')
on conflict do nothing;

commit;
