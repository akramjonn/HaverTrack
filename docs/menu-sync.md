# Supabase Haverford menu sync

The live menu is fetched by `sync-haverford-menu`, then written through one
database transaction. A fetch or parse failure records an error but never
deletes or replaces the last successful menu.

## One-time deployment

1. Ensure `.env` contains `DATABASE_URL` and either `SUPABASE_URL` or
   `EXPO_PUBLIC_SUPABASE_URL`.
2. Authenticate the Supabase CLI: `supabase login`.
3. Run `npm run setup:menu-sync`.

The setup command applies only the menu-sync migration (it does not replay the
repository's older migrations), deploys the function without gateway JWT
verification, generates a random `MENU_SYNC_SECRET`, stores the same value in
the function's secrets and Supabase Vault, installs the
`havertrack-menu-sync` Cron job on `*/15 * * * *` (UTC), and invokes the
function once to verify the pipeline. The endpoint still requires the private
`x-menu-sync-secret` header.

No GitHub repository secret is needed. Do not put `MENU_SYNC_SECRET` or the
service-role key in the app's `EXPO_PUBLIC_*` variables.

## Operations

- Edge Function logs contain structured `menu_sync_succeeded` and
  `menu_sync_failed` events with a run ID.
- `public.menu_sync_status` stores the last attempt, last successful sync, and
  last error. `public.menu_sync_runs` stores per-run history.
- Supabase Dashboard > Integrations > Cron > Jobs shows schedule and run history.
- Re-running `npm run setup:menu-sync` rotates the secret and replaces the named
  Cron job instead of creating a duplicate.
