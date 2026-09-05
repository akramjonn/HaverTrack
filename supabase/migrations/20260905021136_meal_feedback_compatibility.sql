begin;
-- Keep the deployed GitHub menu-sync writer compatible through the app rollout.
-- Multiple station occurrences require a coordinated source-writer release.
alter table public.menu_items add constraint menu_items_nutrislice_id_meal_period_served_date_key
  unique(nutrislice_id,meal_period,served_date);
alter function public.admin_today() set search_path='';
revoke execute on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
insert into public.schema_migrations(version) values('20260905021136_meal_feedback_compatibility.sql') on conflict do nothing;
commit;
