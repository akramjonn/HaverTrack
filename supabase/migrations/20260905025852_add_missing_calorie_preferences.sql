begin;

-- The original additive preferences migration was never applied to the linked
-- project. Keep this repair idempotent so it is safe for fresh and existing
-- environments alike.
alter table public.profiles add column if not exists sex text
  check (sex is null or sex in ('male', 'female', 'unspecified'));

alter table public.user_preferences add column if not exists daily_step_goal integer
  check (daily_step_goal is null or (daily_step_goal > 0 and daily_step_goal <= 100000));
alter table public.user_preferences add column if not exists add_burned_calories boolean not null default false;
alter table public.user_preferences add column if not exists rollover_calories boolean not null default false;

insert into public.schema_migrations(version)
values ('20260905025852_add_missing_calorie_preferences.sql')
on conflict do nothing;

commit;
