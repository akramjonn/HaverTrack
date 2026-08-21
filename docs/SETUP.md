# HaverTrack — setup and operations

Everything here needs credentials or dashboard access, so it cannot be scripted from
the repo. Work through it once per environment.

## 1. Environment variables

`.env` (git-ignored) holds:

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
DATABASE_URL=postgresql://postgres.<ref>:<url-encoded password>@<pooler host>:5432/postgres
```

The password in `DATABASE_URL` **must be percent-encoded** (`@` → `%40`, `#` → `%23`).
An unencoded `@` splits the URL at the wrong place and surfaces as
`password authentication failed for user "postgres"`, which looks like a wrong
password rather than a malformed URL.

> **Rotate the database password.** It was previously hardcoded in
> `scripts/migrate.ts` and `scripts/sync-nutrislice.ts`. Those literals are gone, but
> the value should be rotated in the Supabase dashboard (Settings → Database) and
> updated in `.env` and in the `DATABASE_URL` GitHub Actions secret.

## 2. Database migrations

```bash
npx tsx scripts/migrate.ts
```

Applies every file in `supabase/migrations` in filename order and records what ran in
`public.schema_migrations`. Safe to re-run.

## 3. Edge functions

Three functions exist in `supabase/functions`. **None are deployed yet** — until they
are, photo scans silently fall back to an on-device estimate, and account deletion
fails with an error.

```bash
supabase link --project-ref <ref>

supabase secrets set ANTHROPIC_API_KEY=<key>
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

supabase functions deploy analyze-photo
supabase functions deploy estimate-goals
supabase functions deploy delete-account
```

Verify with:

```bash
curl -i -X POST "https://<ref>.supabase.co/functions/v1/analyze-photo" \
  -H "apikey: <anon key>" -H "Content-Type: application/json" -d '{}'
```

A `401` means it is deployed and rejecting the anonymous call — that is the expected
result. A `404` means it is not deployed.

## 4. Auth settings (Supabase dashboard)

**Authentication → Providers → Email**
- Enable "Confirm email". The app expects `signUp` to return no session until the
  address is confirmed.

**Authentication → Email Templates** — the app verifies with 6-digit codes rather than
magic links, because deep links are unreliable in Expo Go. Each of these templates must
include `{{ .Token }}`:

| Template | Used by |
| --- | --- |
| Confirm signup | `verify-email` in `confirm` mode |
| Change email address | `verify-email` in `college` mode |
| Reset password | `forgot-password` |

> **"The code is invalid" / no code ever arrives.** This is almost always this exact
> step skipped. Supabase's default templates only contain `{{ .ConfirmationURL }}` (a
> magic link) — no `{{ .Token }}` — so no numeric code is ever generated, and whatever
> the user types is checked against a code that was never issued. Open each of the
> three templates above and add a line like `Your code is {{ .Token }}` to it; there is
> nothing to fix in the app itself for this. If codes *were* arriving and suddenly
> stop, the second most common cause is Supabase's free-tier built-in email sender rate
> limit (a handful of emails/hour) — switch to a custom SMTP provider under
> **Authentication → Settings → SMTP Settings** for real testing volume.

**Authentication → URL Configuration**
- Add `havertrack://` to the redirect allow-list. Keep `squirreltrack://` allow-listed
  too during the transition, so any in-flight email confirmation/reset links from
  before the rename don't break.

## 5. Granting admin access

`profiles.role` is server-owned: a `before update` trigger blocks the client from
changing its own role. Promote a user from SQL only:

```sql
update public.profiles set role = 'admin' where email = 'you@haverford.edu';
```

Because the trigger overwrites `role` on update, run this as the service role or
`postgres` (the SQL editor in the dashboard qualifies), not through the app.

## 6. Running the app

Camera capture and barcode scanning need a real device — the iOS Simulator has no
camera, and browsers only expose `getUserMedia` over `localhost` or HTTPS.

```bash
npx expo start     # then scan the QR code with Expo Go on a phone
```

Everything the app currently uses is supported in Expo Go. A development build
(`npx expo install expo-dev-client && eas build --profile development`) only becomes
necessary for widgets, Live Activities or HealthKit.

## 7. Checks before shipping

```bash
npx tsc --noEmit                  # types
npx expo export --platform ios    # confirms the bundle actually builds
```
