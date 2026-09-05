# Meals, ratings, and dining dashboard

## Implemented

- Main dishes first, then optional extras, then a portion review and one meal confirmation.
- Cream/scarlet food cards, consistent category icons, subtle press/fade animation, reduced-motion handling, allergen details, search and dietary filters.
- Account-scoped drafts, offline meal replay, atomic database writes, stable item IDs, and preserved ratings when unchanged food items are edited.
- One overall 1–5 star rating per meal, optional explicit dish ratings, feedback tags and comments, editable feedback, in-app recent-meal prompts, and notification preferences.
- Native notification registration and authenticated deep links; server reminder scheduling, quiet hours, daily caps, one snooze, cancellation, retry/ambiguous-send handling, and delivery receipts.
- Responsive `/admin` dashboard with meals, satisfaction, rating distributions, trends, service filters, dishes, paginated feedback, menu category/availability controls, paginated student records, audited user summaries, reminder states, CSV exports, and audit history.
- Deployed migrations, reminder worker, private scheduler secret, and an active once-per-minute job on the linked Supabase project.

## Open the screens

Run `npm run web` and visit `/admin` with an administrator account. Student menu: `/menu`. Rating: `/rate?meal=<owned-meal-id>`. Reminders: `/notification-settings`.

### Expo Go and development builds

Expo Go is intentionally treated as a preview: from Expo SDK 53, Android Expo Go cannot obtain remote push tokens. The app does not initialize remote push APIs there, so meal logging and in-app ratings still work without notification warnings. Use `npm run dev` after installing an EAS `development` build to test actual reminders. Build it with `eas build --profile development --platform android` or `eas build --profile development --platform ios`; install that build once, then start Metro with `npm run dev` and open it in the development client.

`/design-preview` is a development-only interactive preview of the meal flow, food icon sheet, star control, and example dashboard. It clearly labels its illustrative data and does not save meals or ratings. Production builds show only a development-preview notice.

The web build includes explicit `/admin/user?id=...` routes so private user records do not need to be statically enumerated. Deploy the Expo web export with extensionless HTML resolution and a fallback for existing dynamic app routes. No new public hosting domain was provisioned in this change.

## Backend deployment

Applied migrations:

1. `20260905012411_guided_meals_feedback.sql`
2. `20260905021136_meal_feedback_compatibility.sql`
3. `20260905021342_rating_scheduler_extensions.sql`
4. `20260905023211_private_rating_worker.sql`

Worker: `supabase/functions/send-rating-reminders/index.ts`.

The worker deliberately disables gateway JWT verification and instead requires the private `x-dispatch-secret` header. Never expose that secret to a client. The scheduler reads it from Supabase Vault; the matching function secret is stored with the Edge Function.

`node --import tsx scripts/configure-rating-scheduler.ts` configures/rotates this feature's secret and installs its job. It sends secret values directly to the CLI and database without printing them or writing them into the repository. It must be run with the intended linked project and the corresponding `DATABASE_URL`.

`node --import tsx scripts/verify-meal-deployment.ts` performs read-only deployment checks, including anonymous API denial and scheduler status. It never sends a test push.

## Native release

`expo-notifications` is a new native dependency. Rebuild the native app with the Expo plugin and the existing EAS project. Confirm APNs/FCM credentials, install the build on physical iOS and Android devices, and enable reminders from the confirmation screen or settings.

Check permission refusal, foreground/background/cold-start notification taps, logout/account switching, a real one-hour delay, quiet hours, and deleting/rating a meal before its reminder. JavaScript bundle success does not establish physical push delivery or animation frame rate.

## Staff workflow

Menu management separates suggested categories from staff-reviewed overrides. Review breakfast/brunch/lunch/dinner classifications before a broad rollout. Missing categories remain visible in the review queue. “Published” means listed for that service, not live kitchen inventory. Staff can mark a serving unavailable.

Dish averages use explicit dish ratings only. Overall meal stars are never copied to every food. Unrated dishes show “Unrated”; leaderboards mark samples below five responses. CSV dish reports contain up to the 100 most selected dishes; feedback export explicitly exports the current filtered page. Student sort controls apply to the current 50-row page.

Food reports exclude admin accounts; the existing platform-activity reports retain their pre-existing definitions. Journey completion uses starts and confirmations within 24 hours. Nutrition totals are labeled partial when a guided meal contains unknown nutrition. Rating response uses the selected campus-date meal cohort.

## Compatibility and rollout

The old Nutrislice uniqueness constraint remains alongside the more specific serving constraint so the deployed GitHub sync writer keeps working. The source currently retains one occurrence of a dish per service/date. Expanding ingestion to preserve the same dish at multiple stations requires a coordinated source-writer release before dropping that compatibility constraint.

Old unscoped local cache keys are preserved on disk, but are not automatically attributed to a different signed-in account. New logs and drafts are scoped by account. Synced history reloads from the server; genuinely old unsynced unscoped entries may require an owner-verified recovery path.

Rollout switches:

- `EXPO_PUBLIC_GUIDED_MEALS=false`: restore the previous menu screen in a new app/web build.
- `EXPO_PUBLIC_MEAL_RATINGS=false`: hide recent-meal prompts and redirect the rating route in a new build.
- `RATING_DISPATCH_ENABLED=false`: immediately disable sending on the worker after updating its secret. Keep stored meals and feedback intact.

Disable push dispatch before rolling back the feature. Schema rollback is unnecessary and would risk deleting feedback. The core meal writer depends on the new atomic-save function, so retain the deployed schema while older/newer app versions coexist.

## Verification and remaining release checks

Verified: TypeScript, targeted feature lint, classification/identity/star/CSV checks, account-switch race regressions, isolated PostgreSQL tests for all application migrations, atomic rollback, stable IDs, cross-user denial, protected admin/worker access, exact meal/dish aggregates, snoozed in-app prompts, reminder claiming/dispatch, and deletion cascades. Web, iOS, and Android production JavaScript exports build successfully.

The isolated database harness uses a dedicated local Postgres port and disposable database with minimal Supabase Auth/Storage stand-ins. Supabase-only scheduler extensions are verified against the linked project instead. Run `node --import tsx scripts/test-meal-feedback-db.ts` against that disposable instance; it never reads production `DATABASE_URL`.

Pure client regression checks: `node --import tsx scripts/test-meal-flow.ts` and `node --import tsx scripts/test-meal-account-isolation.ts`. The latter executes the actual store with deterministic storage/network adapters to verify delayed saves and reads across account switches.

Whole-repository lint has existing failures in unrelated onboarding, scanner, and other screens. Targeted lint for the new meal, rating, and dashboard components passes. The security-advisor baseline also includes existing privileged admin RPC warnings and disabled leaked-password protection; role checks remain enforced inside those RPCs.

This feature's privileged implementations are in the private schema; public worker wrappers are invoker-only and executable only by the server role. The non-relocatable `pg_net` extension has public extension metadata and triggers the extension-location advisor; its actual network schema and Cron schema are inaccessible to client roles. Relocating that extension requires separate controlled extension maintenance.

Visual browser QA is blocked because the installed browser plugin is missing `scripts/browser-client.mjs`. Physical-device push delivery, accessibility walkthroughs, frame-rate profiling, and a student pilot remain release checks. No claim of passing those checks is made by the bundle or database tests.

The implementation delivers the core workflow and reporting. More advanced analytics from the plan—long-lived anonymous event aggregates, retention cohorts, and post-notification rating attribution—remain follow-up work. No data is fabricated for those metrics.
