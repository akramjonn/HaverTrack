-- ==============================================================================
-- HaverTrack — sex field for calorie calc, plus daily step goal and calorie
-- rollover/burned-back preferences
-- ==============================================================================

-- Optional self-reported sex, used only to improve the Mifflin-St Jeor BMR
-- offset in calculateGoals(). Unset behaves exactly as it does today (neutral
-- offset) — this is additive personalization, not a required field.
alter table public.profiles add column if not exists sex text
  check (sex is null or sex in ('male', 'female', 'unspecified'));

-- Daily step goal (Personal Details) and two opt-in calorie-math adjustments
-- (Preferences): burned calories added back to the daily target, and up to
-- 200 kcal of yesterday's unused budget rolled into today.
alter table public.user_preferences add column if not exists daily_step_goal integer
  check (daily_step_goal is null or (daily_step_goal > 0 and daily_step_goal <= 100000));
alter table public.user_preferences add column if not exists add_burned_calories boolean not null default false;
alter table public.user_preferences add column if not exists rollover_calories boolean not null default false;
