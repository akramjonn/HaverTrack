begin;
create table public.nutrition_reviews (
  source_key text primary key,
  source jsonb not null,
  candidates jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending','approved')),
  lookup_error text,
  checked_at timestamptz,
  approved_macros jsonb,
  selected_candidate jsonb,
  serving_grams numeric check (serving_grams > 0 and serving_grams <= 10000),
  basis text check (basis in ('source','usda')),
  review_notes text,
  reviewed_at timestamptz,
  dietary_tags text[] not null default '{}',
  dietary_evidence text
);
alter table public.nutrition_reviews enable row level security;
revoke all on public.nutrition_reviews from public, anon, authenticated;
grant select on public.nutrition_reviews to authenticated;
grant all on public.nutrition_reviews to service_role;
create policy nutrition_read on public.nutrition_reviews for select to authenticated using (true);

alter table public.menu_items add column nutrition_source_key text;
create function private.queue_nutrition_review() returns trigger language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  snapshot := jsonb_build_object('location_id',new.location_id,'nutrislice_id',new.nutrislice_id,
    'dish_name',new.dish_name,'description',new.description,'ingredients',new.ingredients,'serving_size',new.serving_size,
    'calories',new.calories,'protein_g',new.protein_g,'carbs_g',new.carbs_g,'fat_g',new.fat_g,
    'dietary_tags',new.dietary_tags,'allergens',new.allergens);
  new.nutrition_source_key := md5(snapshot::text);
  insert into public.nutrition_reviews(source_key,source) values(new.nutrition_source_key,snapshot) on conflict do nothing;
  return new;
end $$;
revoke all on function private.queue_nutrition_review() from public, anon, authenticated;
create trigger queue_nutrition_review before insert or update on public.menu_items for each row execute function private.queue_nutrition_review();
update public.menu_items set nutrition_source_key = null;
create index menu_nutrition_source_idx on public.menu_items(nutrition_source_key);
create index nutrition_pending_idx on public.nutrition_reviews(checked_at) where status = 'pending';

create view public.reviewed_menu_items with (security_invoker=true) as
select (jsonb_populate_record(null::public.menu_items, to_jsonb(m) ||
  case when r.status = 'approved' then r.approved_macros || jsonb_build_object('dietary_tags',
    (select coalesce(jsonb_agg(distinct t),'[]'::jsonb) from unnest(coalesce(m.dietary_tags,'{}') || r.dietary_tags) t)) else '{}'::jsonb end)).*,
  to_jsonb(r) as nutrition_review
from public.menu_items m left join public.nutrition_reviews r on r.source_key = m.nutrition_source_key;
revoke all on public.reviewed_menu_items from public, anon;
grant select on public.reviewed_menu_items to authenticated, service_role;

create function private.publish_nutrition_review(p_key text, p_candidate integer, p_grams numeric, p_basis text, p_notes text, p_tags text[], p_evidence text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.nutrition_reviews; candidate jsonb; macros jsonb := '{}'; k text; v numeric;
begin
  perform public.admin_require();
  select * into strict r from public.nutrition_reviews where source_key=p_key for update;
  if not exists(select 1 from public.menu_items where nutrition_source_key=p_key) then raise exception 'Source changed; reload the menu'; end if;
  if p_basis is null or p_basis not in ('source','usda') or p_grams is null or p_grams <= 0 or p_grams > 10000 then raise exception 'A valid serving weight and basis are required'; end if;
  if length(trim(coalesce(p_notes,''))) < 12 then raise exception 'Document the food match, preparation, and serving evidence'; end if;
  select c into candidate from jsonb_array_elements(r.candidates) c where (c->>'fdcId')::integer = p_candidate limit 1;
  if candidate is null then raise exception 'USDA selection changed; reload and select a comparison'; end if;
  foreach k in array array['calories','protein_g','carbs_g','fat_g'] loop
    if candidate->'macros'->>k is null then raise exception 'The USDA comparison must include all four macro values'; end if;
    v := case when p_basis='source' then (r.source->>k)::numeric else (candidate->'macros'->>k)::numeric*p_grams/100 end;
    if v is null or v < 0 or v::text in ('NaN','Infinity','-Infinity') then raise exception 'All four macro values must be valid'; end if;
    macros := macros || jsonb_build_object(k,case when k='calories' then round(v) else round(v,2) end);
  end loop;
  if p_tags is null or not p_tags <@ array['Halal','Kosher','Gluten-Free','Vegan','Vegetarian'] then raise exception 'Unsupported dietary label'; end if;
  if cardinality(p_tags)>0 and length(trim(coalesce(p_evidence,'')))<12 then raise exception 'Document certification or dining-service evidence for dietary labels'; end if;
  update public.nutrition_reviews set status='approved',approved_macros=macros,selected_candidate=candidate,
    serving_grams=p_grams,basis=p_basis,review_notes=trim(p_notes),reviewed_at=now(),dietary_tags=p_tags,dietary_evidence=nullif(trim(p_evidence),'') where source_key=p_key;
  insert into public.admin_audit_log(admin_id,action) values(auth.uid(),'nutrition_review:'||jsonb_build_object('source_key',p_key,'basis',p_basis,'macros',macros,'notes',trim(p_notes),'candidate',candidate,'grams',p_grams,'dietary_tags',p_tags,'dietary_evidence',p_evidence)::text);
end $$;
create function public.publish_nutrition_review(p_key text, p_candidate integer, p_grams numeric, p_basis text, p_notes text, p_tags text[], p_evidence text)
returns void language sql security invoker set search_path = '' as $$ select private.publish_nutrition_review(p_key,p_candidate,p_grams,p_basis,p_notes,p_tags,p_evidence) $$;
revoke all on function private.publish_nutrition_review(text,integer,numeric,text,text,text[],text) from public,anon,authenticated;
revoke all on function public.publish_nutrition_review(text,integer,numeric,text,text,text[],text) from public,anon,authenticated;
grant execute on function private.publish_nutrition_review(text,integer,numeric,text,text,text[],text) to authenticated;
grant execute on function public.publish_nutrition_review(text,integer,numeric,text,text,text[],text) to authenticated;
insert into public.schema_migrations(version) values ('20260917050448_nutrition_reviews.sql') on conflict do nothing;
commit;
