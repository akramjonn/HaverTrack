begin;
alter table public.menu_items add column source_order integer check (source_order >= 0);
comment on column public.menu_items.source_order is 'Zero-based food position within its Nutrislice station; NULL means source order is unknown.';
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
    protein_g, carbs_g, fat_g, dietary_tags, allergens, synced_at, source_order
  )
  select
    item.nutrislice_id, item.location_id, item.meal_period, item.served_date,
    item.station_name, item.station_id, item.dish_name, item.description,
    item.ingredients, item.serving_size, item.calories, item.protein_g,
    item.carbs_g, item.fat_g, item.dietary_tags, item.allergens, item.synced_at, item.source_order
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
    synced_at timestamptz,
    source_order integer
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
    synced_at = excluded.synced_at,
    source_order = excluded.source_order;
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
-- Append the new view column without changing existing column positions or grants.
create or replace view public.reviewed_menu_items with (security_invoker=true) as
select e.id,e.nutrislice_id,e.location_id,e.meal_period,e.served_date,e.station_name,e.station_id,
  e.dish_name,e.description,e.ingredients,e.serving_size,e.calories,e.protein_g,e.carbs_g,e.fat_g,
  e.dietary_tags,e.allergens,e.synced_at,e.availability,e.nutrition_source_key,
  to_jsonb(r) as nutrition_review,m.source_order
from public.menu_items m
left join public.nutrition_reviews r on r.source_key=m.nutrition_source_key
cross join lateral jsonb_populate_record(null::public.menu_items,to_jsonb(m) ||
  case when r.status='approved' then r.approved_macros || jsonb_build_object('dietary_tags',
    (select coalesce(jsonb_agg(distinct t),'[]'::jsonb) from unnest(coalesce(m.dietary_tags,'{}') || r.dietary_tags) t))
  else '{}'::jsonb end) e;
insert into public.schema_migrations(version) values('20260917141120_menu_source_order.sql') on conflict do nothing;
commit;
