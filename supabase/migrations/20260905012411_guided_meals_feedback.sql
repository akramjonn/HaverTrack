-- Guided meals. Additive migration; existing clients can continue logging.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.dish_categories (
  location_id text not null references public.dining_locations(id),
  nutrislice_id integer not null,
  course text not null check (course in ('main','appetizer','side','drink','dessert','condiment','other')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (location_id,nutrislice_id)
);
alter table public.dish_categories enable row level security;
create policy category_read on public.dish_categories for select to authenticated using (true);
grant select on public.dish_categories to authenticated;

alter table public.menu_items add column availability text not null default 'published'
  check (availability in ('published','unavailable','unknown'));
-- A serving may recur at another station or location. NULL stations compare equal.
alter table public.menu_items drop constraint menu_items_nutrislice_id_meal_period_served_date_key;
alter table public.menu_items add constraint menu_serving_identity
  unique nulls not distinct (location_id,nutrislice_id,meal_period,served_date,station_id);

alter table public.meal_logs add column eaten_at timestamptz;
alter table public.meal_logs add column nutrition_complete boolean not null default true;
alter table public.meal_logs add column guided boolean not null default false;
alter table public.meal_logs add column journey_id uuid;
alter table public.meal_logs add column feedback_dismissed boolean not null default false;
alter table public.meal_log_items add column client_item_id text;
update public.meal_log_items set client_item_id=id::text where client_item_id is null;
alter table public.meal_log_items alter column client_item_id set not null;
alter table public.meal_log_items alter column client_item_id set default gen_random_uuid()::text;
alter table public.meal_log_items add constraint meal_item_client_unique unique(meal_log_id,client_item_id);
alter table public.meal_log_items add column nutrislice_id integer;
alter table public.meal_log_items add column location_id text;
alter table public.meal_log_items add column station_name text;
alter table public.meal_log_items add column course text;
alter table public.meal_log_items add column nutrition_complete boolean not null default true;
create index meal_items_menu_idx on public.meal_log_items(menu_item_id);
create index meal_items_dish_idx on public.meal_log_items(location_id,nutrislice_id);

create table public.meal_ratings (
  meal_log_id uuid primary key references public.meal_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check(stars between 1 and 5),
  comment text not null default '' check(char_length(comment)<=500),
  tags text[] not null default '{}' check(tags <@ array['Taste','Freshness','Temperature','Portion size']::text[]),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  reviewed_at timestamptz, reviewed_by uuid references auth.users(id) on delete set null
);
create index meal_ratings_user_idx on public.meal_ratings(user_id,created_at desc);
create table public.dish_ratings (
  meal_log_item_id uuid primary key references public.meal_log_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check(stars between 1 and 5),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index dish_ratings_user_idx on public.dish_ratings(user_id,created_at desc);
alter table public.meal_ratings enable row level security;
alter table public.dish_ratings enable row level security;
create policy own_meal_ratings on public.meal_ratings for select to authenticated using(user_id=(select auth.uid()));
create policy own_dish_ratings on public.dish_ratings for select to authenticated using(user_id=(select auth.uid()));
grant select on public.meal_ratings,public.dish_ratings to authenticated;

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null default 'America/New_York',
  quiet_start smallint not null default 22 check(quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check(quiet_end between 0 and 23),
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy own_preferences on public.notification_preferences for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update on public.notification_preferences to authenticated;

create table private.push_devices (
  token text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check(platform in ('ios','android')), last_active_at timestamptz not null default now()
);
create index push_devices_user_idx on private.push_devices(user_id,last_active_at desc);
create table private.rating_reminders (
  id uuid primary key default gen_random_uuid(),
  meal_log_id uuid not null unique references public.meal_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null, expires_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','leased','sending','accepted','delivered','failed','expired','cancelled','unknown')),
  attempts integer not null default 0, snoozes integer not null default 0,
  lease_until timestamptz, token text, ticket_id text, error text,
  sent_at timestamptz, opened_at timestamptz, receipt_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_due_idx on private.rating_reminders(due_at) where status='pending';
create index reminders_user_idx on private.rating_reminders(user_id,sent_at desc);
alter table private.push_devices enable row level security;
alter table private.rating_reminders enable row level security;
grant all on private.push_devices,private.rating_reminders to service_role;

create table public.meal_flow_events (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  journey_id uuid not null,
  event text not null check(event in ('menu_viewed','meal_flow_started','main_selected','extra_added','rating_prompt_opened')),
  created_at timestamptz not null default now()
);
create index flow_events_journey_idx on public.meal_flow_events(journey_id,event);
create index flow_events_user_idx on public.meal_flow_events(user_id,created_at);
alter table public.meal_flow_events enable row level security;
create policy own_event_insert on public.meal_flow_events for insert to authenticated with check(user_id=(select auth.uid()));
grant insert on public.meal_flow_events to authenticated;

-- Internal privileged implementations. Public wrappers have no elevated privileges.
grant usage on schema private to authenticated;
create function private.save_meal(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); mid uuid; item jsonb; iid text; saved public.meal_logs; menu public.menu_items; ids text[]:='{}';
begin
  if uid is null then raise exception 'Sign in to save a meal' using errcode='42501'; end if;
  if jsonb_typeof(p->'items')<>'array' or jsonb_array_length(p->'items') not between 1 and 50 then raise exception 'A meal requires 1–50 items'; end if;
  if length(p->>'title') not between 1 and 200 then raise exception 'Invalid meal title'; end if;
  -- Serialize retries/edits for this one user meal.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || (p->>'client_uuid'),0));
  insert into public.meal_logs(user_id,client_uuid,logged_date,meal_period,title,source,photo_path,eaten_at,guided,journey_id,nutrition_complete)
  values(uid,(p->>'client_uuid')::uuid,(p->>'logged_date')::date,p->>'meal_period',p->>'title',p->>'source',p->>'photo_path',
    (p->>'eaten_at')::timestamptz,coalesce((p->>'guided')::boolean,false),(p->>'journey_id')::uuid,coalesce((p->>'nutrition_complete')::boolean,true))
  on conflict(user_id,client_uuid) do update set logged_date=excluded.logged_date,meal_period=excluded.meal_period,
    title=excluded.title,photo_path=excluded.photo_path,eaten_at=excluded.eaten_at,nutrition_complete=excluded.nutrition_complete
  returning id into mid;
  for item in select value from jsonb_array_elements(p->'items') loop
    iid:=coalesce(item->>'client_item_id',item->>'id');
    if iid is null or length(iid)>500 or iid=any(ids) then raise exception 'Invalid or duplicate item identity'; end if;
    ids:=array_append(ids,iid);
    if (item->>'portion')::numeric<=0 or (item->>'portion')::numeric>100 then raise exception 'Invalid portion'; end if;
    if coalesce((item->>'calories')::numeric,0)<0 then raise exception 'Invalid nutrition'; end if;
    menu:=null;
    if item->>'menu_item_id' is not null then
      select * into menu from public.menu_items where id=(item->>'menu_item_id')::uuid;
    elsif item->>'nutrislice_id' is not null then
      select * into menu from public.menu_items where nutrislice_id=(item->>'nutrislice_id')::integer
        and location_id=item->>'location_id' and served_date=(p->>'logged_date')::date
        and (meal_period=p->>'meal_period' or (meal_period='brunch' and p->>'meal_period'='breakfast'))
        and station_name=item->>'station_name' limit 1;
    end if;
    -- Historical edits can retain existing dishes; newly added unavailable servings cannot be selected.
    if menu.id is not null and not exists(select 1 from public.meal_log_items where meal_log_id=mid and client_item_id=iid) then
      if menu.availability='unavailable' then raise exception '% is no longer available',menu.dish_name; end if;
      if menu.served_date<>(p->>'logged_date')::date then raise exception 'The dish belongs to another service date'; end if;
    end if;
    insert into public.meal_log_items(meal_log_id,client_item_id,menu_item_id,name,portion,portion_unit,calories,protein_g,carbs_g,fat_g,is_estimate,confidence_score,nutrislice_id,location_id,station_name,course,nutrition_complete)
    values(mid,iid,menu.id,item->>'name',(item->>'portion')::numeric,item->>'portion_unit',
      (item->>'calories')::integer,(item->>'protein_g')::numeric,(item->>'carbs_g')::numeric,(item->>'fat_g')::numeric,
      coalesce((item->>'is_estimate')::boolean,false),(item->>'confidence_score')::numeric,
      coalesce(menu.nutrislice_id,(item->>'nutrislice_id')::integer),coalesce(menu.location_id,item->>'location_id'),
      coalesce(menu.station_name,item->>'station_name'),item->>'course',coalesce((item->>'nutrition_complete')::boolean,true))
    on conflict(meal_log_id,client_item_id) do update set
      name=excluded.name,portion=excluded.portion,portion_unit=excluded.portion_unit,calories=excluded.calories,
      protein_g=excluded.protein_g,carbs_g=excluded.carbs_g,fat_g=excluded.fat_g,nutrition_complete=excluded.nutrition_complete;
  end loop;
  delete from public.meal_log_items where meal_log_id=mid and not(client_item_id=any(ids));
  update public.meal_logs set total_calories=t.calories,total_protein_g=t.protein,total_carbs_g=t.carbs,total_fat_g=t.fat
  from(select coalesce(sum(calories),0)::integer calories,coalesce(sum(protein_g),0) protein,coalesce(sum(carbs_g),0) carbs,coalesce(sum(fat_g),0) fat
    from public.meal_log_items where meal_log_id=mid)t where id=mid returning public.meal_logs.* into saved;
  if saved.eaten_at between now()-interval '24 hours' and now()+interval '5 minutes' and not saved.feedback_dismissed
    and not exists(select 1 from public.meal_ratings where meal_log_id=mid) then
    insert into private.rating_reminders(meal_log_id,user_id,due_at,expires_at)
    values(mid,uid,saved.eaten_at+interval '60 minutes',saved.eaten_at+interval '24 hours') on conflict(meal_log_id) do nothing;
    update private.rating_reminders set due_at=saved.eaten_at+interval '60 minutes',expires_at=saved.eaten_at+interval '24 hours'
      where meal_log_id=mid and status='pending' and snoozes=0;
  else
    update private.rating_reminders set status='cancelled' where meal_log_id=mid and status in ('pending','leased');
  end if;
  return to_jsonb(saved)||jsonb_build_object('meal_log_items',(select jsonb_agg(i order by i.created_at,i.client_item_id) from public.meal_log_items i where meal_log_id=mid));
end $$;
create function public.save_meal(p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_meal(p)$$;

create function private.submit_meal_rating(p_meal uuid,p_stars integer,p_comment text,p_tags text[],p_dishes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); d jsonb;
begin
  perform 1 from public.meal_logs where id=p_meal and user_id=uid for update;
  if not found then raise exception 'Meal not found' using errcode='42501'; end if;
  if p_stars not between 1 and 5 or p_stars is null then raise exception 'Choose 1–5 stars'; end if;
  if jsonb_typeof(p_dishes)<>'array' or jsonb_array_length(p_dishes)>50 then raise exception 'Invalid dish ratings'; end if;
  if exists(select 1 from public.meal_ratings where meal_log_id=p_meal and updated_at>now()-interval '1 second') then raise exception 'Please wait before updating your rating'; end if;
  insert into public.meal_ratings(meal_log_id,user_id,stars,comment,tags) values(p_meal,uid,p_stars,coalesce(p_comment,''),coalesce(p_tags,'{}'))
  on conflict(meal_log_id) do update set stars=excluded.stars,comment=excluded.comment,tags=excluded.tags,updated_at=now(),reviewed_at=null,reviewed_by=null;
  for d in select value from jsonb_array_elements(p_dishes) loop
    if not exists(select 1 from public.meal_log_items where id=(d->>'id')::uuid and meal_log_id=p_meal) then raise exception 'Dish is not in this meal' using errcode='42501'; end if;
    insert into public.dish_ratings(meal_log_item_id,user_id,stars) values((d->>'id')::uuid,uid,(d->>'stars')::smallint)
    on conflict(meal_log_item_id) do update set stars=excluded.stars,updated_at=now();
  end loop;
  update public.meal_logs set feedback_dismissed=false where id=p_meal;
  update private.rating_reminders set status='cancelled' where meal_log_id=p_meal and status in ('pending','leased');
end $$;
create function public.submit_meal_rating(p_meal uuid,p_stars integer,p_comment text default '',p_tags text[] default '{}',p_dishes jsonb default '[]') returns void
language sql security invoker set search_path='' as $$select private.submit_meal_rating(p_meal,p_stars,p_comment,p_tags,p_dishes)$$;

create function private.rating_reminder_action(p_meal uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.meal_logs where id=p_meal and user_id=auth.uid()) then raise exception 'Meal not found' using errcode='42501'; end if;
  if p_action='dismiss' then
    update public.meal_logs set feedback_dismissed=true where id=p_meal;
    update private.rating_reminders set status='cancelled' where meal_log_id=p_meal and status in ('pending','leased');
  elsif p_action='snooze' then
    update private.rating_reminders set status='pending',due_at=now()+interval '60 minutes',snoozes=1
      where meal_log_id=p_meal and snoozes=0 and expires_at>now()+interval '60 minutes'
      and not exists(select 1 from public.meal_ratings where meal_log_id=p_meal);
  elsif p_action='opened' then
    update private.rating_reminders set opened_at=coalesce(opened_at,now()) where meal_log_id=p_meal;
  else raise exception 'Invalid reminder action'; end if;
end $$;
create function public.rating_reminder_action(p_meal uuid,p_action text) returns void language sql security invoker set search_path='' as $$select private.rating_reminder_action(p_meal,p_action)$$;

create function private.register_rating_device(p_token text,p_platform text,p_remove boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  if p_remove then delete from private.push_devices where token=p_token and user_id=auth.uid(); return; end if;
  if p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Invalid push token'; end if;
  insert into private.push_devices(token,user_id,platform) values(p_token,auth.uid(),p_platform)
    on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,last_active_at=now();
end $$;
create function public.register_rating_device(p_token text,p_platform text,p_remove boolean default false) returns void language sql security invoker set search_path='' as $$select private.register_rating_device(p_token,p_platform,p_remove)$$;

-- Role checking happens inside every elevated operation, never in user metadata.
create function private.admin_food_report(p_days integer,p_period text,p_location text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; since date:=public.admin_today()-least(greatest(p_days,1),90)+1;
begin
  perform public.admin_require();
  with cohort as (
    select m.* from public.meal_logs m join public.profiles p on p.id=m.user_id
    where m.logged_date>=since and p.role<>'admin'
      and (p_period is null or m.meal_period=p_period)
      and (p_location is null or exists(select 1 from public.meal_log_items i where i.meal_log_id=m.id and i.location_id=p_location))
  ), rated as (select r.* from public.meal_ratings r join cohort c on c.id=r.meal_log_id),
  dishes as (
    select i.location_id,i.nutrislice_id,max(i.name) name,count(*) selections,count(distinct c.user_id) users,
      count(r.stars) ratings,round(avg(r.stars),2) average,
      count(*) filter(where r.stars=1) one,count(*) filter(where r.stars=2) two,count(*) filter(where r.stars=3) three,
      count(*) filter(where r.stars=4) four,count(*) filter(where r.stars=5) five
    from cohort c join public.meal_log_items i on i.meal_log_id=c.id left join public.dish_ratings r on r.meal_log_item_id=i.id
    group by i.location_id,i.nutrislice_id,case when i.nutrislice_id is null then i.name end
  )
  select jsonb_build_object(
    'meals',(select count(*) from cohort),'ratings',(select count(*) from rated),
    'average',(select round(avg(stars),2) from rated),
    'eligible',(select count(*) from cohort c where not feedback_dismissed or exists(select 1 from rated where meal_log_id=c.id)),
    'guided',(select count(*) from cohort where guided),
    'with_extras',(select count(*) from cohort c where guided and exists(select 1 from public.meal_log_items i where i.meal_log_id=c.id and i.course<>'main')),
    'distribution',(select jsonb_agg(jsonb_build_object('stars',s,'count',(select count(*) from rated where stars=s))) from generate_series(1,5)s),
    'dishes',coalesce((select jsonb_agg(d) from(select * from dishes order by selections desc limit 100)d),'[]'),
    'trend',coalesce((select jsonb_agg(t order by t.day) from (select c.logged_date as day,count(distinct c.id) meals,count(r.meal_log_id) ratings,round(avg(r.stars),2) average from cohort c left join rated r on r.meal_log_id=c.id group by c.logged_date)t),'[]'),
    'reminders',coalesce((select jsonb_object_agg(status,n) from(select r.status,count(*) n from private.rating_reminders r join cohort c on c.id=r.meal_log_id group by r.status)t),'{}'),
    'reminder_opens',(select count(*) from private.rating_reminders r join cohort c on c.id=r.meal_log_id where r.opened_at is not null),
    'tracking_since',(select min(created_at) from public.meal_flow_events),
    'journeys_started',(select count(distinct e.journey_id) from public.meal_flow_events e join public.profiles p on p.id=e.user_id where e.event='meal_flow_started' and e.created_at>=since::timestamp at time zone 'America/New_York' and p.role<>'admin'),
    'journeys_completed',(select count(distinct e.journey_id) from public.meal_flow_events e join public.profiles p on p.id=e.user_id where e.event='meal_flow_started' and e.created_at>=since::timestamp at time zone 'America/New_York' and p.role<>'admin' and exists(select 1 from public.meal_logs m where m.journey_id=e.journey_id and m.user_id=e.user_id and m.created_at between e.created_at and e.created_at+interval '24 hours'))
  ) into result;
  return result;
end $$;
create function public.admin_food_report(p_days integer default 30,p_period text default null,p_location text default null) returns jsonb
language sql security invoker set search_path='' as $$select private.admin_food_report(p_days,p_period,p_location)$$;

create function private.admin_feedback(p_days integer,p_stars integer,p_search text,p_offset integer,p_reviewed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.admin_require();
  with filtered as (
    select r.meal_log_id,r.stars,r.comment,r.tags,r.created_at,r.reviewed_at,m.title,m.meal_period,m.logged_date,
      (select jsonb_agg(jsonb_build_object('name',i.name,'stars',dr.stars)) from public.meal_log_items i join public.dish_ratings dr on dr.meal_log_item_id=i.id where i.meal_log_id=m.id) dishes
    from public.meal_ratings r join public.meal_logs m on m.id=r.meal_log_id
    where m.logged_date>=public.admin_today()-least(greatest(p_days,1),90)+1
      and (p_stars is null or r.stars=p_stars)
      and (p_search is null or r.comment ilike '%'||left(p_search,100)||'%' or m.title ilike '%'||left(p_search,100)||'%')
      and (p_reviewed is null or (r.reviewed_at is not null)=p_reviewed)
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(t) from(select * from filtered order by created_at desc,meal_log_id limit 25 offset greatest(p_offset,0))t),'[]')) into result;
  return result;
end $$;
create function public.admin_feedback(p_days integer default 30,p_stars integer default null,p_search text default null,p_offset integer default 0,p_reviewed boolean default null) returns jsonb
language sql security invoker set search_path='' as $$select private.admin_feedback(p_days,p_stars,p_search,p_offset,p_reviewed)$$;

create function private.admin_food_update(p_action text,p_id text,p_value text,p_location text,p_dish integer) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_require();
  if p_action='category' then
    insert into public.dish_categories(location_id,nutrislice_id,course,updated_by) values(p_location,p_dish,p_value,auth.uid())
    on conflict(location_id,nutrislice_id) do update set course=excluded.course,updated_by=excluded.updated_by,updated_at=now();
  elsif p_action='availability' then update public.menu_items set availability=p_value where id=p_id::uuid;
  elsif p_action='review' then update public.meal_ratings set reviewed_at=case when p_value='reviewed' then now() end,reviewed_by=auth.uid() where meal_log_id=p_id::uuid;
  elsif p_action<>'export' then raise exception 'Invalid admin action'; end if;
  insert into public.admin_audit_log(admin_id,action) values(auth.uid(),'food:'||p_action||':'||coalesce(p_id,p_dish::text,'report')||':'||coalesce(p_value,''));
end $$;
create function public.admin_food_update(p_action text,p_id text default null,p_value text default null,p_location text default null,p_dish integer default null) returns void
language sql security invoker set search_path='' as $$select private.admin_food_update(p_action,p_id,p_value,p_location,p_dish)$$;

-- Worker functions are callable only with a server role key.
create function public.claim_rating_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update private.rating_reminders set status='unknown',error='Dispatch interrupted; not automatically resent' where status='sending' and lease_until<now();
  update private.rating_reminders set status='pending' where status='leased' and lease_until<now();
  update private.rating_reminders set status='expired' where expires_at<now() and status='pending';
  update private.rating_reminders r set status='cancelled' where status in ('pending','leased') and
    (exists(select 1 from public.meal_ratings where meal_log_id=r.meal_log_id) or exists(select 1 from public.meal_logs where id=r.meal_log_id and feedback_dismissed));
  -- Raw event retention. Aggregate meal/rating reports use their original records.
  delete from public.meal_flow_events where created_at<now()-interval '90 days';
  with ready as (
    select r.id,d.token from private.rating_reminders r
    join public.notification_preferences p on p.user_id=r.user_id and p.enabled
    join lateral(select token from private.push_devices where user_id=r.user_id order by last_active_at desc limit 1)d on true
    join pg_timezone_names tz on tz.name=p.timezone
    where r.status='pending' and r.due_at<=now() and r.expires_at>now() and r.attempts<3
    and not(case when p.quiet_start<p.quiet_end then extract(hour from now() at time zone p.timezone)>=p.quiet_start and extract(hour from now() at time zone p.timezone)<p.quiet_end
      when p.quiet_start>p.quiet_end then extract(hour from now() at time zone p.timezone)>=p.quiet_start or extract(hour from now() at time zone p.timezone)<p.quiet_end else false end)
    and (select count(*) from private.rating_reminders x where x.user_id=r.user_id and x.sent_at>=date_trunc('day',now() at time zone p.timezone) at time zone p.timezone)<3
    order by r.due_at limit 50 for update of r skip locked
  ), claimed as(update private.rating_reminders r set status='leased',lease_until=now()+interval '5 minutes',token=ready.token from ready where r.id=ready.id returning r.id,r.meal_log_id,r.token)
  select coalesce(jsonb_agg(claimed),'[]') into result from claimed;
  return result;
end $$;
create function public.begin_rating_dispatch(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('rating-dispatch:'||(select user_id::text from private.rating_reminders where id=p_id),0));
  update private.rating_reminders r set status='sending',attempts=attempts+1,sent_at=now()
  where r.id=p_id and r.status='leased' and r.lease_until>now() and r.expires_at>now()
    and exists(select 1 from public.notification_preferences p where p.user_id=r.user_id and p.enabled)
    and exists(select 1 from private.push_devices d where d.user_id=r.user_id and d.token=r.token)
    and not exists(select 1 from public.meal_ratings where meal_log_id=r.meal_log_id)
    and not exists(select 1 from public.meal_logs where id=r.meal_log_id and feedback_dismissed)
    and (select count(*) from private.rating_reminders x where x.user_id=r.user_id and x.id<>r.id and x.sent_at>now()-interval '24 hours')<3
  returning id into claimed;
  return claimed is not null;
end $$;
create function public.finish_rating_dispatch(p_id uuid,p_status text,p_ticket text default null,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('accepted','delivered','failed','unknown','pending') then raise exception 'Invalid dispatch status'; end if;
  update private.rating_reminders set status=p_status,ticket_id=coalesce(p_ticket,ticket_id),error=left(p_error,300),
    due_at=case when p_status='pending' then now()+interval '5 minutes' else due_at end,
    sent_at=case when p_status='pending' then null else sent_at end,
    receipt_checked_at=case when p_status in ('delivered','failed') then now() else receipt_checked_at end where id=p_id;
  if p_error='DeviceNotRegistered' then delete from private.push_devices where token=(select token from private.rating_reminders where id=p_id); end if;
end $$;
create function public.rating_receipts_due() returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(t),'[]') from(select id,ticket_id from private.rating_reminders where status='accepted' and sent_at<now()-interval '15 minutes' order by sent_at limit 100)t
$$;

revoke all on function private.save_meal(jsonb),private.submit_meal_rating(uuid,integer,text,text[],jsonb),private.rating_reminder_action(uuid,text),private.register_rating_device(text,text,boolean),private.admin_food_report(integer,text,text),private.admin_feedback(integer,integer,text,integer,boolean),private.admin_food_update(text,text,text,text,integer) from public,anon;
grant execute on function private.save_meal(jsonb),private.submit_meal_rating(uuid,integer,text,text[],jsonb),private.rating_reminder_action(uuid,text),private.register_rating_device(text,text,boolean),private.admin_food_report(integer,text,text),private.admin_feedback(integer,integer,text,integer,boolean),private.admin_food_update(text,text,text,text,integer) to authenticated;
revoke all on function public.save_meal(jsonb),public.submit_meal_rating(uuid,integer,text,text[],jsonb),public.rating_reminder_action(uuid,text),public.register_rating_device(text,text,boolean),public.admin_food_report(integer,text,text),public.admin_feedback(integer,integer,text,integer,boolean),public.admin_food_update(text,text,text,text,integer) from public,anon;
grant execute on function public.save_meal(jsonb),public.submit_meal_rating(uuid,integer,text,text[],jsonb),public.rating_reminder_action(uuid,text),public.register_rating_device(text,text,boolean),public.admin_food_report(integer,text,text),public.admin_feedback(integer,integer,text,integer,boolean),public.admin_food_update(text,text,text,text,integer) to authenticated;
revoke all on function public.claim_rating_reminders(),public.begin_rating_dispatch(uuid),public.finish_rating_dispatch(uuid,text,text,text),public.rating_receipts_due() from public,anon,authenticated;
grant execute on function public.claim_rating_reminders(),public.begin_rating_dispatch(uuid),public.finish_rating_dispatch(uuid,text,text,text),public.rating_receipts_due() to service_role;

create function private.admin_user_food_stats(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.admin_require();
  insert into public.admin_audit_log(admin_id,action,subject_user_id) values(auth.uid(),'view_user_food_summary',p_user);
  return jsonb_build_object('ratings',(select count(*) from public.meal_ratings where user_id=p_user),
    'average',(select round(avg(stars),2) from public.meal_ratings where user_id=p_user),
    'reminders_enabled',coalesce((select enabled from public.notification_preferences where user_id=p_user),false));
end $$;
create function public.admin_user_food_stats(p_user uuid) returns jsonb language sql security invoker set search_path='' as $$select private.admin_user_food_stats(p_user)$$;
revoke all on function private.admin_user_food_stats(uuid),public.admin_user_food_stats(uuid) from public,anon;
grant execute on function private.admin_user_food_stats(uuid),public.admin_user_food_stats(uuid) to authenticated;

insert into public.schema_migrations(version) values('20260905012411_guided_meals_feedback.sql') on conflict do nothing;
commit;
