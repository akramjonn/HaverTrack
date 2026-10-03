begin;

create schema if not exists private;
create table private.analysis_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  used_count integer not null check (used_count between 1 and 25),
  primary key (user_id, usage_date)
);
alter table private.analysis_usage enable row level security;
revoke all on private.analysis_usage from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on private.analysis_usage to service_role;

-- Service-role-only RPC: the edge handler supplies the verified user identity.
-- No caller-controlled date or limit. ON CONFLICT serializes same-user/day
-- reservations, including the initial insert, before any provider call begins.
create function public.reserve_analysis_usage(p_user_id uuid) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
  v_used integer;
begin
  insert into private.analysis_usage as usage (user_id, usage_date, used_count)
    values (p_user_id, v_day, 1)
  on conflict (user_id, usage_date) do update
    set used_count = usage.used_count + 1
    where usage.used_count < 25
  returning used_count into v_used;

  return coalesce(25 - v_used, -1);
end;
$$;
revoke all on function public.reserve_analysis_usage(uuid) from public, anon, authenticated;
grant execute on function public.reserve_analysis_usage(uuid) to service_role;

commit;
