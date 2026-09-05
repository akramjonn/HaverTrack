begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
revoke all on schema cron,net from public,anon,authenticated;
insert into public.schema_migrations(version) values('20260905021342_rating_scheduler_extensions.sql') on conflict do nothing;
commit;
