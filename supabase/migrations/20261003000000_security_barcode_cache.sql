begin;

-- Product provenance cannot be established for rows written by mobile clients.
-- Retire the shared client cache and discard both poisoned hits and false misses.
revoke insert, update, delete, truncate, references, trigger
  on public.barcode_cache from public, anon, authenticated;
drop policy if exists "Authenticated users can populate the barcode cache" on public.barcode_cache;
drop policy if exists "Authenticated users can bump cache hit counts" on public.barcode_cache;
truncate table public.barcode_cache;

commit;
