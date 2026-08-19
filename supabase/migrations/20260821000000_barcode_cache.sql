-- ==============================================================================
-- SquirrelTrack — WS-B: barcode product cache
-- Additive only: no existing column is dropped or retyped.
-- ==============================================================================

-- Barcodes are looked up against OpenFoodFacts then USDA FoodData Central, both
-- rate-limited third parties on the far side of a mobile connection. A campus
-- has maybe 200 distinct packaged products moving through the Coop and vending
-- machines, so after the first week nearly every scan should be an instant,
-- offline-tolerant cache hit instead of two outbound API calls.
--
-- Keyed by the raw code the camera actually scanned (not a normalized form) —
-- the same physical barcode always decodes to the same string, so this is the
-- correct cache key without needing to reproduce lookup-time UPC/EAN
-- normalization here.
create table if not exists public.barcode_cache (
  barcode text primary key,
  name text,
  brand text,
  serving_size text,
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sugar_g numeric,
  sodium_mg numeric,
  saturated_fat_g numeric,
  basis text check (basis is null or basis in ('serving', 'per_100g')),
  -- 'miss' rows record a barcode neither API resolved, so a repeat scan of a
  -- dead code fails fast instead of re-querying both APIs every time; they
  -- also tell the operator exactly what to backfill.
  source text not null check (source in ('off', 'fdc', 'miss')),
  hit_count integer not null default 1,
  resolved_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

alter table public.barcode_cache enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'barcode_cache'
      and policyname = 'Authenticated users can read the barcode cache'
  ) then
    create policy "Authenticated users can read the barcode cache"
      on public.barcode_cache for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'barcode_cache'
      and policyname = 'Authenticated users can populate the barcode cache'
  ) then
    create policy "Authenticated users can populate the barcode cache"
      on public.barcode_cache for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'barcode_cache'
      and policyname = 'Authenticated users can bump cache hit counts'
  ) then
    -- Only hit_count/last_hit_at/source ever change after the first insert;
    -- the app enforces that client-side, this policy just needs any signed-in
    -- user able to keep a shared, non-personal cache warm.
    create policy "Authenticated users can bump cache hit counts"
      on public.barcode_cache for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

create index if not exists idx_barcode_cache_source on public.barcode_cache(source);
