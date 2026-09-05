# HaverTrack design, guided meals, ratings, and web dashboard plan

Prepared September 4, 2026. Status: implementation proposal; no application or database changes made.

## 1. Outcome and proposed defaults

Make choosing a dining hall meal simpler and more inviting, then connect the meal the student logs to useful food feedback and administrative reporting.

The primary journey will be:

1. Open today's menu and see main dishes.
2. Choose a main dish.
3. Add available appetizers, sides, another main, drinks, or dessert.
4. Review portions and confirm the meal.
5. Receive a later reminder to rate the food.
6. Submit a 1–5 star rating; authorized administrators see updated statistics.

Recommended defaults for implementation:

- Preserve the HaverTrack name, cream/scarlet palette, Outfit typography, and existing brand mark.
- Interpret selection as a draft until the user explicitly confirms the meal. This app logs food; selecting a dish does not place an order or reserve inventory.
- Start with one main dish; allow additional mains in the second step. All extras are optional.
- Schedule one rating reminder 60 minutes after the recorded meal time. Offer “Rate now” in meal history for food already eaten.
- Ask for one overall meal rating, with optional individual dish ratings and a short comment. Keep overall and dish averages separate.
- Put the dashboard at a dedicated `/admin` web path, using the existing application and backend as the foundation.
- Treat “available” as published for the selected location, date, and service, unless an administrator explicitly marks an item unavailable. The present integration is not live inventory.

These are product assumptions for the plan, not decisions already supplied by the user. Timing, visual direction, and optional dish ratings can be adjusted before their implementation without changing the core architecture.

## 2. What exists and what needs to change

Repository inspection found:

| Area | Existing foundation | Planned change |
| --- | --- | --- |
| Platform | Expo 57, React Native 0.86, Expo Router, web export | Stay on the current SDK; validate new APIs against version 57 documentation |
| Visual system | Shared colors, fonts, radii, buttons, cards, Lucide icons, custom SVG brand mark | Refine spacing, hierarchy, interaction states, and motion consistently |
| Menu | Today's items grouped by station, search, dietary filters, quick logging | Main dishes first; progressively reveal extras and review |
| Plate builder | Nutrition-based plate suggestions and logging | Reuse suggestions inside the guided meal flow |
| Data source | Nutrislice parser, sync script, bundled fallback, Supabase menu store | Add reliable categories, source identity, availability overrides, and review status |
| Logging | Meal logs and child items, client UUID for offline replay | Atomic saves and stable item IDs; preserve menu references through every layer |
| Admin | Overview, student roster/details, menu health, analytics RPCs, audit log | Dedicated responsive web navigation, ratings, selection funnel, reminder reports, and exports |
| Ratings/reminders | No implementation found in inspected routes, dependencies, or migrations | Add rating storage, prompt lifecycle, device registration, dispatch, and receipt handling |

Specific integration issues to resolve:

- `ParsedMenuItem` has no course/category or photo field, and the live menu query omits the database menu row ID.
- `meal_log_items` already has a `menu_item_id` column, but the inspected logging types and writer do not carry it through.
- `pushMealLog` currently deletes and recreates child rows. Ratings must not reference IDs that disappear during a routine edit.
- `logMeal` identifies the newly created log by comparing store snapshots. Return the saved log identity directly to avoid ambiguity when multiple saves overlap.
- The current unique menu key does not include location or station. Establish a serving identity before expanding location filtering or retaining multiple station occurrences.
- Brunch exists in source menus but not the menu screen's period selector; Co-op is currently inferred from station names. Model service period and location separately and avoid presenting that inference as a verified location feed.
- `(admin)` is a route group, not an explicit URL namespace. Give the web console concrete `/admin/...` routes and update existing links.
- Web output is currently static. Authenticated dynamic user pages need a deliberate export/deep-link strategy, such as `/admin/user?id=...`, rather than trying to pre-render private user IDs.

Inspection covered local source and migration files, not the live database, production configuration, or rendered screens. Visual QA and deployed-schema verification belong to the first implementation phase.

## 3. Design refresh and icons

Keep the familiar brand but give food selection a clearer hierarchy:

- Warm cream canvas, white or lightly tinted cards, scarlet primary actions, restrained gold for stars and highlights.
- Standardize spacing around a 4/8-point scale, two principal card radii, and consistent control heights.
- Make dish names the strongest element within food cards. Put service location, serving size, and dietary labels below them; keep secondary nutrition details compact.
- Use real, approved food photos where available. Use coordinated category illustrations when no photo exists; do not imply an illustration is the actual dish.
- Design selected, pressed, disabled, loading, error, empty, and offline states alongside the happy path.
- Keep the main action anchored above the safe area so the next step remains easy to reach.
- Apply shared component improvements to home, menu, food detail, meal history, and settings. Check the scanner and onboarding for regressions from shared changes.

Create an icon specification and reusable semantic icon component. Use consistent 20/24px sizes, stroke weight, corner treatment, and active states. Extend the existing Lucide/SVG system for main dish, appetizer, side, drink, dessert, plate, serving quantity, star rating, reminder, availability, users, trends, feedback, and export. Create custom vectors only where the existing set lacks an appropriate symbol. Include a monochrome Android notification asset.

Accessibility requirements: descriptive labels, selected-state announcements, visible web focus, keyboard support, at least 44px touch targets, scalable text, sufficient text contrast, and state indicators beyond color alone. Star controls announce “3 out of 5 stars,” for example.

Deliverables: screen mockups for the core journey, component state sheet, icon sheet, revised design tokens, and desktop/mobile dashboard layouts.

## 4. Motion specification

Use the existing Reanimated installation for native interactions and verify web behavior separately. Expo's version 57 reference lists the installed Reanimated 4.5.1 version: [Expo v57 Reanimated](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/).

| Interaction | Intended motion | Initial tuning target |
| --- | --- | --- |
| Button/card press | Small scale response and color transition | 100–140ms |
| Main dish selection | Border/background transition and checkmark reveal | 160–220ms |
| Main → extras → review | Short horizontal transition with fade | 220–300ms |
| Extra added/removed | Selection transition and updated summary | 160–220ms |
| Detail sheet | Controlled spring with drag-to-dismiss | Approximately 250–350ms settling |
| Star selection | Quick fill and small scale response | 120–180ms |
| Successful save | Checkmark and brief confirmation | 250–400ms |
| Dashboard filter change | Stable layout with subtle data transition | 150–250ms |

These are tuning targets, not measured performance claims. Favor transform/opacity animation, isolate expensive work from interactions, virtualize longer lists, and reserve image dimensions to prevent layout jumps. Do not animate every row on every refresh. Use light haptics on meaningful native actions.

Honor Reduce Motion: replace movement/springs with immediate updates or short fades, preserve all feedback, and stop decorative animation offscreen. Profile representative release builds on iOS and Android; target stable 60fps on the chosen baseline devices, including during scrolling and state changes.

## 5. Guided menu behavior

### Step 1: Choose your main

- Display date, location, current service, and “Choose your main.” Default service using campus time and actual published periods.
- Show main dishes only, with focused search and dietary filters.
- Selecting a dish marks the card and enables “Continue.” Opening details reveals serving information, nutrition, ingredients, and allergens without logging anything.
- Include breakfast and brunch mains when those services exist.
- Provide an explicit secondary “Build a meal without a main” path for a student choosing soup/salad/sides only. Do not show the full menu automatically.

### Step 2: Add to your meal

- Keep the selected main visible in a compact plate summary with an edit action.
- Show only nonempty sections for appetizers, sides, additional mains, drinks, desserts, and other published items.
- Use selectable cards/rows with portion controls, immediate totals, and a clear “Skip extras” action.
- Keep availability and filters scoped to the same service/date/location. Do not fabricate pairings: generic extras are simply available additions unless a real pairing rule exists.
- Preserve draft choices when navigating backward. If the user changes service or location, explain which choices no longer apply and require review before confirmation.

### Step 3: Review and confirm

- Summarize the main and extras, portions, meal time, and available nutrition totals.
- Allow removing extras, swapping the main, and adjusting portions.
- Represent missing nutrition as unknown/partial; never silently count it as zero. Selection and food feedback remain possible even when nutrition is incomplete; update nutrition aggregation/display to support that case.
- “Confirm meal” saves one meal containing all its items. Show “Saved on this device—waiting to sync” when offline, and server confirmation when synchronized.
- Present a confirmation state with reminder information and an optional contextual notification permission request.

Drafts persist locally per account; discard/clear them on logout and expire or revalidate them when the service date changes. Handle an empty menu, no matching filters, a missing main classification, no extras, stale data, sync failure, and an item withdrawn before confirmation explicitly. A stale snapshot must not appear to be today's verified service.

## 6. Classification and availability

Add a course vocabulary: `main`, `appetizer`, `side`, `drink`, `dessert`, `condiment`, and `other`. Store the assignment source and review status.

Classification order:

1. Preserve an administrator's override.
2. Use authoritative source category data if available and verified during source inspection.
3. Apply documented station/dish rules with a confidence/review flag.
4. Send ambiguous items to an admin review queue.

Do not use station names alone as final truth: one station may serve both mains and sides. Before rollout, review representative menus for breakfast, brunch, lunch, and dinner and ensure each populated service has sensible entry choices.

Store persistent dish-level category overrides separately from dated serving availability so the next menu sync does not erase staff corrections. Support “published,” “unavailable,” and “unknown” presentation; show last refresh time. Preserve historical dish/serving snapshots when upstream rows disappear or names change.

## 7. Rating experience and reminder lifecycle

The reminder starts from a confirmed, synchronized meal, not the first tap on a main dish. Proposed copy: “How was your meal? Give it a quick rating.” Keep lock-screen text generic; load meal details after authenticated navigation.

Rating screen:

- Meal name, service/date, and selected items.
- Overall rating from 1 to 5 whole stars, initially unselected.
- Optional individual dish ratings for food actually included in that meal.
- Optional short comment, capped at 500 characters, and feedback tags such as taste, freshness, temperature, or portion size.
- “Submit,” “Later,” and “I didn't eat this.” The last option dismisses the prompt and excludes the meal from feedback eligibility without silently deleting the nutrition log.
- Allow users to edit their submitted rating; retain one current rating for each target. Administrators cannot change a user's star value.

Reminder policy:

- Default due time: recorded meal time + 60 minutes, using a real timestamp rather than the current display-only time string.
- Only recent, eligible meals receive pushes. Proposed expiry: 24 hours after the meal; older/backdated logs remain rateable from history without unsolicited catch-up pushes.
- Respect user opt-out and device permission. Provide a persistent in-app “Rate your recent meal” card when a push cannot be shown.
- Suggested quiet hours: 10pm–8am in the user's timezone; defer within the expiry window or keep an in-app prompt.
- Send one automatic reminder per meal; offer one explicit 60-minute snooze. Cap proactive reminders at three per day and use the most recently active authorized device by default.
- Cancel queued work when the meal is deleted, dismissed, already rated, or the user opts out. Recheck eligibility immediately before dispatch; already-sent OS notifications cannot always be recalled.
- For offline logs, schedule only after server acknowledgment using the original meal time. If already due but still recent, apply quiet hours/caps; if expired, retain only the in-app prompt.

Implementation: install the SDK-compatible `expo-notifications`, configure its plugin and native credentials, register account-bound installation tokens, and handle initial-launch and running-app notification responses. Rating deep links must wait for session restoration and verify ownership. Test push in development/release builds on physical iOS and Android devices. [Expo v57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)

Use a durable server outbox and scheduled dispatcher so reminders work when the app is closed. A scheduled Supabase Edge Function can process due work, backed by protected scheduler credentials: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

Claim jobs with leases, enforce one logical job per meal/purpose, use bounded retries, and record provider tickets/receipts. Invalidate unregistered tokens and remove account associations on sign-out. External push delivery is not an exactly-once channel; define handling for ambiguous sends and avoid blindly resending after a provider acceptance timeout. A successful provider receipt is not proof the user saw the message. Track opens separately. [Expo push delivery guidance](https://docs.expo.dev/push-notifications/sending-notifications/)

## 8. Data model and write contracts

Extend existing entities where possible rather than duplicating the meal history.

| Entity | Changes/purpose |
| --- | --- |
| Dish catalog/category overrides | Stable source dish identity, category, optional approved image, classification source, reviewer |
| Menu servings (`menu_items`) | Carry row ID into clients; scope serving identity by location/service/date and station where verified; availability override |
| Meal logs | Keep client idempotency key; add meal timestamp and feedback eligibility/dismissal state |
| Meal log items | Stable client/server item identity; menu/dish references; role in plate; name, serving, and nutrition snapshot |
| Meal ratings | Owner, meal, integer 1–5 rating, comment/tags, timestamps; unique per meal |
| Dish ratings | Owner, stable logged item, integer 1–5 rating, timestamps; unique per logged item |
| Device installations/preferences | Account-bound push token, platform, last activity, opt-in, timezone and quiet-hour settings |
| Reminder outbox/attempts | Meal, due/expiry time, status, lease, attempts, ticket/receipt, error and open timestamp |
| Product events | Event UUID, journey UUID, event type, permitted context, event/receipt timestamps |
| Admin audit log | Extend existing log for named feedback reads, exports, category/availability changes |

Use database constraints for star bounds, uniqueness, ownership relationships, and valid states. Index foreign keys and the actual access patterns: user/date history, dish/date ratings, service/date menu lookup, and due pending reminders. Retain existing UUID conventions for exposed entities; use client-generated stable IDs for offline work. Use timestamp-with-time-zone values for instants and campus-local dates for menu service grouping.

Implement an atomic meal-save operation that writes the parent, updates stable child items, and creates/cancels eligible reminder work together. Preserve `(user_id, client_uuid)` replay safety. Do not delete/reinsert every child during an edit. Removed items invalidate their associated current feedback according to an explicit rule; unchanged items retain ratings. Historical legacy items can remain unlinked when identity is ambiguous—do not backfill solely by a dish-name guess.

Separate meal/dish ratings so nullable target fields cannot undermine uniqueness. Verify the logged item belongs to the referenced meal and requesting user. Overall stars must never be copied automatically onto every dish. Nutrition score and satisfaction rating are separate concepts.

## 9. Admin web dashboard

Build a desktop-oriented shell with left navigation, date range controls, service/location filters, refresh status, and account menu. Collapse navigation on small screens; provide accessible tables with pagination, sorting, search, and empty/error states. Load aggregates on the server and return paginated detail rows.

| Page | Contents |
| --- | --- |
| Overview | Total/new/active users, confirmed meals, rating count and average, rating response rate, selection completion, trends, top dishes, operational alerts |
| Meals and dishes | Selections by dish/service/station, distinct users, repeat selection, add-on popularity, rating count/distribution, low-rated foods |
| Ratings and feedback | Separate meal and dish feedback, star filters, comment search, date/location filters, review status, pending/resolved staff workflow |
| Users | Searchable existing roster, verification/onboarding/activity, meal/rating counts, reminder preference; audited authorized user detail |
| Menu management | Category review queue, category overrides, availability, source refresh status, missing nutrition, historical service coverage |
| Notifications | Eligible/scheduled/attempted/accepted/failed/expired jobs, receipt status, opens and follow-on ratings |
| Reports and audit | Filtered CSV exports, metric definitions, data refresh time, and administrative access/change history |

For food rankings, display the average alongside count and distribution. Mark small samples and use a configurable minimum count—proposed five—for ranked “best/worst” lists. Provide an unrated state instead of zero stars. Avoid implying that voluntary app ratings represent all diners.

Keep the existing protection around student health information: aggregate food insights are the default; named user detail is audited. Dining feedback access should not automatically expose meal photos or detailed weight history. Start with the existing admin role; add narrower reporting/feedback permissions if separate dining staff accounts are needed. Export only fields allowed by the requesting admin's permissions and neutralize spreadsheet formula injection in CSV text fields.

## 10. Metrics and data collection

Define the grain and denominator before building charts:

- A confirmed meal is one meal log/plate, regardless of the number of foods in it. A dish selection is one stable logged item; serving quantity is a separate measure.
- An active user is a distinct authenticated user performing a defined meaningful action in the reporting window. Label meal-logging activity separately from general app activity so new instrumentation does not silently change historical DAU.
- Meal satisfaction is the average current overall star rating in the selected meal cohort; dish satisfaction uses only explicit item ratings.
- Rating response rate is eligible confirmed meals with an overall rating divided by eligible confirmed meals in the same cohort. Unrated is not a one-star score.
- Selection completion is journeys with a successful confirmation divided by journeys started; use journey IDs and an explicit expiry, proposed 24 hours, rather than raw tap counts.
- Add-on attachment is confirmed guided meals containing at least one non-main extra divided by confirmed guided meals.
- Notification acceptance uses provider tickets; provider receipt success, notification open rate, and post-open rating conversion are distinct measurements. Attribute a rating to the most recent tracked open within 24 hours and label this as attribution, not causation.
- Report a seven-day return-to-log cohort separately from daily/weekly active counts; compare like-for-like date windows in campus time.

Instrument `menu_viewed`, `meal_flow_started`, `main_selected`, `extra_added`, `meal_confirmed`, `rating_prompt_opened`, `rating_submitted`, and `rating_dismissed`. Use server-confirmed records as the source for confirmed-meal/rating totals and deduplicate client events by event UUID. Exclude test/admin traffic from student engagement metrics. Display “tracking began on …” where no historical events exist.

Collect only event context needed for these metrics; avoid raw search text and health measurements in general event payloads. Proposed raw product-event retention is 90 days, with longer-lived anonymous daily aggregates. Meal/rating deletion, account deletion, and aggregate recomputation must follow an explicit retention policy and the existing account-deletion workflow. Record any approved exception separately.

## 11. Authorization and operational safeguards

- Students access only their own logs, ratings, tokens, and preferences. Ownership must be enforced in the database, including both old/new-row checks on updates.
- Admin analytics and user details require server-validated roles; a hidden route or client check is insufficient.
- Apply RLS and explicit grants to new exposed tables, secure views, and restrict privileged function execution. Keep dispatch credentials and elevated Supabase keys on the server. These choices follow [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Keep internal outbox/attempt tables out of the public client API. Reuse the audit approach while checking execution grants and role helpers.
- Clear admin query caches, user drafts, and account-bound notification state on logout/account switch.
- Rate-limit rating writes and validate comments, filter inputs, and exports. Moderation can hide a comment with an audited reason; original stars remain intact unless the underlying record is explicitly invalidated.
- Update the app's privacy explanation to describe food ratings, reminders, administrator access, and deletion behavior.

The Supabase and Postgres skills informed the ownership constraints, aggregate access, indexing, and migration verification in this plan. Current documentation must be checked again when implementing; no migration SQL is being authored in this planning pass.

## 12. Work packages and implementation order

| Phase | Work and deliverables | Completion gate |
| --- | --- | --- |
| 1. Baseline and design | Render existing app on native/web, verify deployed schema and menu samples, inventory UI states, finalize wireframes and metric definitions | Reviewed screens and data contracts cover all primary states |
| 2. Identity and schema | Preserve serving IDs, stable meal-item writes, category model, rating tables, RLS and aggregate contracts; verify migrations locally/staging | Replay and ownership tests pass; existing logging remains compatible |
| 3. UI foundation | Design token polish, icon components, buttons/cards/sheets, motion primitives and accessibility | Component gallery works across native/web and Reduce Motion |
| 4. Guided meal flow | Main → extras → review, draft persistence, filters, portions, availability, offline reconciliation | Complete meal saves once; back navigation and edge states work |
| 5. Ratings and reminders | Rating UI, history prompt, outbox/dispatcher, native registration, receipts, deep links, preferences | End-to-end delayed reminder and rating pass on iOS/Android |
| 6. Admin web | Dedicated URLs/shell, overview, food analytics, users, ratings, menu review, notifications, CSV and audit | Authorized browser users can inspect/export accurate filtered data |
| 7. Validation and rollout | Accessibility/performance pass, cohort metric checks, migrations/deployment rehearsal, staged student pilot | All release acceptance criteria pass and rollback controls are exercised |

Dependencies: stable item identity precedes item ratings; reliable categories precede the mains-first rollout; server-confirmed meal saves precede reminder scheduling; metric definitions precede dashboard queries. Dashboard shell work can overlap the native flow once data contracts are stable.

Indicative effort for one engineer, including basic design and QA: 24–36 working days (about five to seven weeks), assuming access to working native builds, the backend, and hosting. Suggested breakdown: baseline/design 2–3 days; identity/backend 4–6; visual foundation 2–3; guided flow 4–5; ratings/reminders 4–6; dashboard 5–8; final validation 3–5. This is a planning estimate, not a delivery commitment; deployment credentials, category cleanup, and distribution review can add calendar time.

## 13. Likely implementation map

- Visual foundation: `src/constants/theme.ts`, `src/components/ui/*`, `src/components/navigation/AppTabBar.tsx`, and new shared motion/icon modules.
- Menu journey: `src/app/(tabs)/menu.tsx`, `src/app/food/[id].tsx`, `src/app/log/plate.tsx`, `src/store/menuStore.ts`, plus dedicated meal-flow components and draft store.
- Data identity/logging: `src/lib/nutrislice.ts`, `scripts/sync-nutrislice.ts`, `src/lib/logging.ts`, `src/lib/mealLogs.ts`, `src/store/logStore.ts`.
- Ratings: new rating screen/components and data client, integrated with meal history and home prompts.
- Notifications: new device/notification client, root notification response handling in `src/app/_layout.tsx`, preferences in settings, Expo plugin configuration, and server dispatcher.
- Dashboard: adapt `src/app/(admin)/*` into explicit admin routes, move chart helpers outside route directories, extend `src/lib/admin.ts`, and add rating/menu/notification modules.
- Backend: additive migrations, protected analytics/write operations, scheduled reminder function, and generated database types.

Keep new configuration compatible with existing native build settings. The worktree currently has a user modification to `eas.json`; inspect and preserve it during implementation.

## 14. Acceptance criteria and verification

Product checks:

1. The initial menu shows mains, with extras appearing only after a user chooses a main or deliberately starts a meal without one.
2. Every offered item belongs to the selected published service, and uncertain availability is visibly labeled.
3. Main, extras, and portions persist across backward navigation; confirmation creates exactly one meal.
4. Offline retries do not duplicate meals, child items, ratings, or logical reminder jobs.
5. Editing a meal retains ratings on unchanged items; removed items and deleted meals follow defined feedback/reminder rules.
6. A reminder opens the correct owned meal from cold start, background, and foreground states; denied permissions still leave a usable in-app prompt.
7. Rating writes accept only 1–5 whole stars; no user can rate another user's log or an item absent from their meal.
8. Dashboard meal counts, dish counts, averages, distributions, and cohort denominators match a seeded reference dataset, including empty and unrated cases.
9. Ordinary students cannot fetch admin aggregates, private user detail, raw tokens, or dispatch work through direct API calls.
10. Desktop/tablet/mobile web layouts, keyboard navigation, screen readers, large text, and Reduce Motion remain usable.

Verification plan:

- Run TypeScript and existing lint/check scripts, plus targeted tests for classification, stable save/replay behavior, rating validation, and reminder eligibility/time boundaries.
- Use local/staging database integration tests for atomic rollback, ownership, admin authorization, account deletion, item edits, and duplicate request handling.
- Test real native push permission, token rotation, logout/account switch, quiet hours, daylight-saving boundaries, dispatch retry, receipt errors, and signed-out deep links.
- Compare dashboard queries to fixtures with repeated dishes on multiple days, partial nutrition, zero ratings, edited/deleted ratings, multiple items per plate, and delayed offline submissions.
- Verify direct browser URL loads, refresh, login redirects, static-export routing, pagination, CSV filtering, and unauthenticated denial.
- Profile release builds and visually inspect loading/error/empty states. Performance targets: stable baseline-device scrolling and dashboard overview usable within roughly two seconds under an agreed staging dataset/network; measure before claiming success.

## 15. Rollout and final deliverables

Deploy additive backend changes first, preserving compatibility with existing app versions. Backfill only trustworthy identity/category data, then enable the guided flow for a pilot cohort. Enable reminders after token registration and cancellation are verified; open the web dashboard to designated admins after authorization checks pass. Prepare a web preview before production publication and use the project's authorized hosting workflow at implementation time.

Use separate feature switches for guided meals, rating prompts, and push dispatch. A rollback disables new entry points/dispatch while preserving submitted meals and ratings; avoid destructive schema rollback after data collection begins. Observe sync failures, confirmation errors, invalid classifications, reminder failures, and unexpected metric shifts during the pilot before broad rollout.

Final implementation deliverables: polished app screens and icon system, documented motion settings, guided meal selection, five-star meal/dish feedback, delayed native reminders plus in-app fallback, responsive admin website, secure migrations/data contracts, verified reports, deployment notes, and an administrator guide for categories, availability, feedback review, and metric interpretation.
