begin;

-- Preserve worker API names without placing elevated implementations in an
-- exposed schema. Existing restrictive EXECUTE grants survive the move.
alter function public.claim_rating_reminders() set schema private;
alter function public.begin_rating_dispatch(uuid) set schema private;
alter function public.finish_rating_dispatch(uuid,text,text,text) set schema private;
alter function public.rating_receipts_due() set schema private;

create function public.claim_rating_reminders() returns jsonb
language sql security invoker set search_path='' as $$select private.claim_rating_reminders()$$;
create function public.begin_rating_dispatch(p_id uuid) returns boolean
language sql security invoker set search_path='' as $$select private.begin_rating_dispatch(p_id)$$;
create function public.finish_rating_dispatch(p_id uuid,p_status text,p_ticket text default null,p_error text default null) returns void
language sql security invoker set search_path='' as $$select private.finish_rating_dispatch(p_id,p_status,p_ticket,p_error)$$;
create function public.rating_receipts_due() returns jsonb
language sql security invoker set search_path='' as $$select private.rating_receipts_due()$$;

revoke all on function public.claim_rating_reminders(),public.begin_rating_dispatch(uuid),public.finish_rating_dispatch(uuid,text,text,text),public.rating_receipts_due() from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.claim_rating_reminders(),public.begin_rating_dispatch(uuid),public.finish_rating_dispatch(uuid,text,text,text),public.rating_receipts_due() to service_role;
grant execute on function private.claim_rating_reminders(),private.begin_rating_dispatch(uuid),private.finish_rating_dispatch(uuid,text,text,text),private.rating_receipts_due() to service_role;

-- Return only the caller's next prompt, without exposing outbox rows or tokens.
create function private.pending_meal_rating() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select jsonb_build_object('id',m.id,'title',m.title) into result
  from public.meal_logs m
  where m.user_id=auth.uid() and not m.feedback_dismissed
    and m.eaten_at between now()-interval '24 hours' and now()-interval '60 minutes'
    and not exists(select 1 from public.meal_ratings r where r.meal_log_id=m.id)
    and not exists(select 1 from private.rating_reminders r where r.meal_log_id=m.id and r.snoozes>0 and r.due_at>now())
  order by m.eaten_at desc,m.id limit 1;
  return result;
end $$;
create function public.pending_meal_rating() returns jsonb
language sql security invoker set search_path='' as $$select private.pending_meal_rating()$$;
revoke all on function private.pending_meal_rating(),public.pending_meal_rating() from public,anon;
grant execute on function private.pending_meal_rating(),public.pending_meal_rating() to authenticated;

insert into public.schema_migrations(version) values('20260905023211_private_rating_worker.sql') on conflict do nothing;
commit;
