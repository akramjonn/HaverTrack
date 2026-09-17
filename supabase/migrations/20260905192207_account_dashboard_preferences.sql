-- =============================================================================
-- HaverTrack — independent display units for the account dashboard
--
-- Measurements remain canonical kg/cm in profiles and weight_entries. These
-- fields only determine how clients render and parse those values.
-- =============================================================================

alter table public.user_preferences
  add column if not exists weight_unit text not null default 'lb',
  add column if not exists height_unit text not null default 'ft_in',
  add column if not exists clock_format text not null default '12h';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_preferences_weight_unit_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_weight_unit_check
      check (weight_unit in ('lb', 'kg'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_preferences_height_unit_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_height_unit_check
      check (height_unit in ('ft_in', 'cm'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_preferences_clock_format_check'
  ) then
    alter table public.user_preferences
      add constraint user_preferences_clock_format_check
      check (clock_format in ('12h', '24h'));
  end if;
end $$;

-- Existing accounts retain the intent of profiles.units. The profile field is
-- deliberately left in place while older clients are still supported.
update public.user_preferences preferences
set
  weight_unit = case when profiles.units = 'metric' then 'kg' else 'lb' end,
  height_unit = case when profiles.units = 'metric' then 'cm' else 'ft_in' end
from public.profiles profiles
where profiles.id = preferences.user_id;

-- A preference row is optional today. Seed existing profiles so that a new
-- Units screen has an authoritative row on its first load without a client
-- write, while preserving per-column database defaults for newly created users.
insert into public.user_preferences (user_id, weight_unit, height_unit)
select
  profiles.id,
  case when profiles.units = 'metric' then 'kg' else 'lb' end,
  case when profiles.units = 'metric' then 'cm' else 'ft_in' end
from public.profiles profiles
where not exists (
  select 1 from public.user_preferences preferences
  where preferences.user_id = profiles.id
);
