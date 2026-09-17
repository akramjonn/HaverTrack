**HaverTrack: MacroFactor account settings and Cal AI dashboard plan**

Prepared September 5, 2026. Status: core implementation completed locally. The app now includes the account hub, independent Units preferences, dashboard and welcome adaptations, lifecycle reliability fixes, and an additive migration. The database migration has not been deployed to a remote Supabase project.

**1. Reference findings and scope**

The supplied [MacroFactor flow](https://mobbin.com/flows/2b177a66-063f-4a38-8bea-88234cb4544b) is titled “Editing units.” Its three public screenshots were retrieved and visually inspected. They show:

- A white “MORE” header, circular initials avatar, account name and membership date above a pale gray scrolling background.
- General: Account, Subscription, Integrations, Units, arranged as rounded white grouped rows with black icons, inset separators and trailing chevrons.
- Feature Settings: Dashboard and Food Log are visible; the rest of the section is outside the captured viewport.
- A pushed Units screen with a back button and grouped radio choices. Weight and height are independent: Pounds/Kilograms and Feet and Inches/Centimeters. Clock supports 12 Hour/24 Hour. A Distance section is partially visible, showing Miles and Yards; remaining options are unverified.
- Screens two and three demonstrate changed radio selections. The screenshots alone do not establish save timing or animation behavior.

The [second reference](https://mobbin.com/screens/13d9864b-04a0-4533-af61-02324649016e) is a **Cal AI signed-in home dashboard**, rather than a sign-up welcome screen. Its screenshot was visually inspected: branded header and streak badge; seven-day selector; large calories-remaining card with a ring and rollover badge; three macro cards; carousel indicators; recent-meals empty state; bottom navigation and floating add button. The source uses Spanish text.

Implementation decision: apply the second design to the signed-in Today route and use its light dashboard language for the unauthenticated welcome screen, without fabricated personal data.

Keep HaverTrack branding and English product copy. Match the references' composition, spacing, typography hierarchy, surfaces, controls and interaction structure. Do not embed competitor logos, sample account details, screenshot numbers, device status bars or Mobbin watermarks in the product.

Mobbin MCP tools and a browser were unavailable in this session. Public page/image access recovered the supplied references. The Account, Subscription, Integrations, Dashboard Settings and Food Log Settings interiors were not inspected. Their detailed designs remain a reference-discovery task; features proposed below are HaverTrack requirements, not claims about unseen MacroFactor screens.

**2. Verified starting point**

| Area | Existing code and behavior | Required work |
|---|---|---|
| Account entry | `src/app/(tabs)/settings.tsx`: identity, stats, goal card, personal details, weight history, reminders, admin link | Reorganize into MacroFactor-style account hub and grouped sections |
| Account lifecycle | `src/app/account-settings.tsx`: rollover, support, legal, export, delete, sign-out | Reuse functionality; correct reliability and completeness gaps |
| Personal details | `src/app/personal-details.tsx`: identity/body inputs, global units, goal weight | Focused editors, independent units, consistent current-weight semantics |
| Goals | `src/app/edit-goals.tsx`, `src/lib/goals.ts`, auth store | Preserve manual targets and regeneration; expose goal type/activity editing with reliable save behavior |
| Preferences | `src/lib/water.ts`; separate local copies in Today, Progress and settings | Dedicated preference service and shared user-scoped query state |
| Units | `profiles.units`, `src/lib/units.ts` | Independent weight, height and clock preferences; verified distance scope |
| Notifications | `src/app/notification-settings.tsx`, native/web notification services | Integrate settings layout; accurate permission, registration and save states |
| Today | `src/app/(tabs)/index.tsx`: live totals, rollover, streak, meals, hydration, rating prompts | Cal AI composition and working date selection; preserve HaverTrack capabilities |
| Welcome | `src/app/(auth)/welcome.tsx`: dark hero, signup/signin actions | Alternative visual adaptation if the user intended the pre-auth screen |
| Navigation | `src/app/_layout.tsx`, tab layout, `AppTabBar.tsx` | Consistent protected account destinations and coordinated tab/add-button layout |

The repository already uses Expo ~57.0.13, Router ~57.0.13, React Native 0.86.2 and React 19.2.3. The [exact SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) and [versioned Router reference](https://docs.expo.dev/versions/v57.0.0/sdk/router/) were read. Use versioned documentation for each touched Expo package. A framework upgrade is not a prerequisite for this redesign.

**3. Account and settings feature plan**

| Section / destination | Planned working behavior | Priority |
|---|---|---|
| Account hub | Reference-style title, avatar, live name/member-since, grouped navigation. Move inline editing into focused destinations. Keep role-gated admin entry. | Core |
| Account / profile | Edit name/class year; show verified email/provider; navigate to personal details. Preserve Haverford eligibility and server-owned role/verification fields. | Core |
| Personal details | Edit height and body inputs; goal weight; weight-history access. Define current weight as a measurement through the weight-entry service, or explicitly label a separate baseline. | Core |
| Units | Dedicated radio-group screen for independent weight/height/clock choices; immediate save with visible pending/error state and rollback on failure. | Core |
| Goals | Goal type, activity level, calorie/macronutrient targets, regenerate and save. Explain recalculation before overwriting manually set targets. | Core |
| Dashboard settings | Rollover toggle, hydration target and useful card visibility choices. Every setting must update Today immediately and persist after restart. | Core |
| Food Log settings | Proposed default add method and meal-list order, after checking the full reference. Apply choices to the add sheet/list; these are new HaverTrack features. | Follow-on |
| Notifications | Meal-rating reminders, system permission state and recovery link. Reuse current backend; editable quiet hours/timezone/daily cap are a separate end-to-end extension. | Core toggle; timing follow-on |
| Privacy and data | Complete export, account deletion, privacy and terms. Progress/error states for long operations. | Core |
| Support and about | Working support contact, campus wellbeing resources, app/build version. | Core |
| Account security | Provider-aware password recovery/change for email-password accounts; recovery callback routing and expired-link states. Email-change and provider-linking require a separate eligibility/security design. | Follow-on |
| Subscription | Actual entitlement status, purchase/restore/manage flows, store configuration, server verification and cancellation/expiry handling if monetization is selected. | Product-dependent |
| Integrations | Select supported health/data providers, permission scopes, read/write ownership, duplicate prevention, sync status, disconnect and deletion behavior; native build validation. | Product-dependent |
| Distance | Verify all choices and identify a distance-consuming feature. Saving a preference alone is not a working distance integration. | Depends on reference/consumer |
| Appearance, avatar, language | Implement only if added to the agreed scope; each requires real persistence and consumers/assets. Not established by the supplied screenshots. | Optional |

Maintain a reference-to-feature checklist. Every visible row must have a real destination and defined loading, empty, saved and failed states. Full Subscription/Integrations parity is a separate milestone because the current app has neither service. Do not ship dead rows or fictitious subscription/sync status; exact menu parity is incomplete until these dependencies are resolved.

**4. Shared components and preference architecture**

- Add a small `src/components/settings/` layer: screen shell, back header, section, navigation row, switch row, radio group and destructive action. Reuse existing primitives when they fit.
- Add semantic settings/dashboard tokens in `src/constants/theme.ts`: white/pale-gray surfaces, primary/muted text, subtle borders, radii and spacing. Start with approximately 16-point screen gutters, 16–20-point card radii and 44-point minimum touch targets, then measure against reference images. Avoid global color replacement that unintentionally restyles admin or auth screens.
- Extract user preferences from `src/lib/water.ts` to a dedicated `src/lib/preferences.ts`. Use the existing TanStack Query provider with keys scoped by user ID and shared mutations. Distinguish loading, missing row and failed read; initialize typed defaults for missing rows and allow the first save.
- Migrate Today, Progress, personal details, account and hydration consumers to that shared state. Invalidate/update affected views after success. Serialize conflicting writes or reject stale responses; preserve drafts and rollback failed optimistic updates.
- Extend `user_preferences` with constrained weight (`lb`/`kg`), height (`ft_in`/`cm`) and clock (`12h`/`24h`) choices. Final distance fields depend on complete reference/consumer verification. Keep identity in profiles, targets in daily goals, and notification behavior in notification preferences.
- Backfill weight/height from legacy `profiles.units`; explicit new values take precedence, with legacy fallback during rollout. Existing metric users retain kg/cm, imperial users retain lb/ft-in. Preserve valid mixed choices. Retain the legacy field temporarily; old clients cannot represent mixed units, so their writes must not silently overwrite independent preferences.
- Keep canonical measurements in kg/cm/ml and convert only at input/display boundaries. Update onboarding, personal details, weight modal/history, Progress chart labels and other consumers. Add separate weight/height selectors instead of treating one global unit system as authoritative.
- Format clock times at render time from canonical timestamps. Current cached `logged_time` strings need compatibility handling. Define whether meal time comes from consumed-at or created-at data, and consistently apply timezone and clock preference.
- Use an additive migration with user ownership constraints/RLS and appropriate grants. Verify existing policies and migration workflow before implementation. Test two users and an unauthenticated client. Backfill safely, verify older-client behavior, and leave legacy fields intact until compatibility is resolved.

**5. Cal AI dashboard and welcome interpretation**

For the recommended signed-in Today redesign, compose the screen in this order:

1. HaverTrack wordmark and interactive streak badge on a light background.
2. Seven-day strip with day initials, dates, selected state, today state and logged-day markers. Tapping changes the selected date; month/year boundaries and local midnight must work. Fetch the selected day's records if outside the loaded cache.
3. Large white calorie card: prominent remaining value on the left, progress ring on the right and an optional rollover indicator. Derive values from the selected day's actual goals and meals; define historical goal lookup rather than silently applying today's goal to all history.
4. Three separate macro cards with remaining grams and small progress rings. Handle zero targets, over-target totals, partial nutrition and tracking-only mode without misleading numbers or invalid rings.
5. If reproducing the visible pager dots, build a real pager: proposed pages are nutrition, hydration and goal summary. Label these as HaverTrack additions because only the first reference page is visible. Dots reflect active page and support accessible navigation.
6. Recent meals: actual selected-day records, useful thumbnail/summary, meal-detail links, and a friendly first-meal empty state. Show the partial-nutrition notice when needed. Integrate pending-rating prompts without obscuring primary controls.
7. A floating add action opening existing scan, food search, quick-add, saved meals and dining-menu entry points. Keep tap targets and bottom safe-area clearance correct.
8. Restyle bottom navigation as one coordinated component. Proposed HaverTrack destinations remain Today, DC menu, Progress and You, with the add action positioned so it does not overlap them. This is an intentional adaptation from the reference's three navigation destinations; do not strand the dining-menu feature.

Primary files: `src/app/(tabs)/index.tsx`, `src/components/navigation/AppTabBar.tsx`, tab layout and new `src/components/dashboard/` components. Remove the public design-gallery shortcut from the production Today surface; retain development access separately.

If the user intended the **pre-auth welcome** screen, redesign `src/app/(auth)/welcome.tsx` with the reference's light surfaces, HaverTrack heading, an explicitly illustrative dashboard preview and bottom signup/signin actions. Do not show fabricated personal nutrition totals as live data. Preserve auth, callback and onboarding behavior. The supplied image cannot define a literal pre-auth flow, so this adaptation requires a welcome composition before coding. If both screens are requested, implement each as its own task.

**6. Reliability work identified by the independent review**

| Priority | Finding | Planned correction and acceptance |
|---|---|---|
| P1 | Missing preference row disables rollover; independent screen copies become stale | Default-aware shared preferences; first user can save; Today/Progress update immediately |
| P1 | `authStore.loadProfile` can apply a response for an old account | Request-generation/account checks; clear profile/goals and all account-specific transient state on account change |
| P1 | Export reads a partial memory snapshot; meal hydration covers only 90 days | Authoritative paginated user-owned export with profile, full goals/meals/weights, water, preferences, favorites, ratings and photo manifest; native file sharing/web download; defined unsynced-data handling |
| P1 | Deletion checks only one page of photos and ignores cleanup errors | Checked paginated storage cleanup, retryable stages, complete ownership inventory; remove local per-user meal/weight/pending-delete caches and scan drafts; separate successful server deletion from local cleanup errors |
| P2 | Root-level settings routes are outside guarded tabs | Shared authenticated route boundary; preserve public auth/callback/legal access; test direct links and session expiry |
| P2 | Goal/onboarding save failures can look successful | Persisted success before navigation, rollback or retained drafts, visible retry; recover from missing/failed profile load |
| P2 | Reminder deregistration failure can abort sign-out | Explicit logout stages and recoverable remote cleanup; immediate account-data isolation and accurate outcome messaging |
| P2 | Existing conditional hook in `src/app/log/[id].tsx` | Correct hook order and verify opening/removing a meal; track broader lint debt independently |

These are code-review findings. Historical local logs also contain old auth-module, Expo Go notification, missing-column, duplicate-key and web-style failures. Treat those as regression scenarios; they are not proof that current code still has each failure.

**7. Agent allocation and execution order**

Planning already used three independent agents: account/settings audit, whole-code review and application-log audit. The coordinator inspected the visual references and assembled this plan. During implementation, assign one concrete task to each agent turn:

| Owner | Single task / owned surfaces | Dependency and handoff |
|---|---|---|
| Reference/design agent | Full reference inventory, measured tokens and screen-state specification | First; deliver mapping before UI work |
| Preferences agent | Preference service, additive migration, unit conversion and all preference consumers | After agreed contracts; deliver tested persistence |
| Account UI agent | Account hub, grouped rows and focused account editors | Uses shared tokens and preference API |
| Dashboard agent | Today composition, selected date, macro cards and add/navigation integration | Depends on screen clarification and preference API |
| Welcome agent, if needed | Pre-auth welcome composition and CTA wiring | Separate task after interpretation is settled |
| Account lifecycle agent | Auth transition safety, export, deletion and sign-out | Shared auth-store changes coordinated with preferences owner |
| Notification agent, if needed | Reminder timing/permission/registration extension | Only after expanded notification scope is selected |
| Whole-code review agent | Review all workstreams and integrated behavior | Independent review at each handoff and final gate |
| Logging agent | Operational event coverage and fresh-log validation across the application | Starts with baseline; checks every integrated milestone |

There are four concurrent slots, including the coordinator. Use waves rather than launching every role simultaneously. Example: coordinator + one implementation owner + reviewer + logging agent; switch the implementation assignment as work finishes. For independent account/dashboard UI work, temporarily run two implementers plus the reviewer, then schedule the logging agent for integration validation. Agents must agree on APIs and file ownership before editing shared theme, layouts or auth stores.

Sequence: reference inventory and scope → shared tokens/contracts → preference and auth foundations → account/Units UI → dashboard or welcome → account lifecycle fixes and agreed follow-on settings → integrated review, visual QA and release readiness. Review and logging deliverables accompany each wave.

**8. Dedicated application logging plan**

The logging agent found local `.expo/dev/logs/start.log` and `export.log`, plus scattered console diagnostics and notification-worker outcomes. No centralized crash/telemetry SDK was found. `src/lib/logging.ts` is meal persistence. No live production stream or continuous monitor was observed.

- Add a distinct observability module with an allowlisted event contract: timestamp, severity, event, route, transient operation ID, build/platform, duration, outcome, sanitized error code and retry count.
- Cover auth restoration/callback/onboarding; preference/profile loads and saves; dashboard data loads; scan and meal persistence failures; hydration; notification permission/registration/dispatch/receipt/open; export generation/sharing; logout and deletion stages. Critical operations need an observable terminal success, cancellation or failure.
- Add error-boundary and query/mutation failure reporting. Correlate client failures with Edge Functions, Auth, API Gateway, Postgres and Storage over the same recorded test window.
- Replace raw photo-analysis provider/candidate payload logging with sanitized summaries. Never log passwords, email addresses, tokens, callback URLs/codes, push tokens, photos, body measurements, nutrition payloads or exported account data.
- Keep development output available locally. A production sink needs an explicit destination, access/retention configuration and release setup; adding event calls alone does not create production monitoring.
- Preserve existing reminder dispatch outcomes instead of duplicating large records. A successful push receipt is not proof a user saw the notification.
- Deliver an event inventory, redaction checks, per-build fresh-log report, incident list and runbook. No unexplained new error may be ignored simply because the screen looks correct.

Use current [Supabase log sources and retention documentation](https://supabase.com/docs/guides/observability/logs). Any scripted monitor must account for the [September 23, 2026 removal of the legacy logs.all endpoint](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint) and use the supported ClickHouse-backed endpoint.

**9. Validation and completion gates**

Baseline checks performed during this planning pass: `npx tsc --noEmit` passed; `scripts/test-auth.ts` passed; `scripts/test-meal-account-isolation.ts` passed. `npm run lint` failed with 26 errors and 45 warnings in existing code. Baseline was recorded before any implementation.

Functional acceptance:

- Fresh user with no preferences; existing imperial and metric users; mixed lb/cm and kg/ft-in; rapid changes; save/restart/second-session persistence; repeated conversions without numeric drift.
- Preference changes refresh Today, Progress and history; offline/server rejection preserves values and offers retry; switching accounts during pending requests never reveals another user's data.
- Cold/warm auth links, signed-out settings links, expired sessions, OAuth cancellation, onboarding failure and profile-load recovery all reach appropriate states.
- `docs/authentication.md` records custom SMTP as unfinished. This is repository documentation, not a freshly verified hosted setting. Before auth release, verify confirmation and recovery delivery to intended users plus production callback configuration.
- Selected-day calories/macros/meal list agree, including midnight/timezone boundaries, no-meal days, over-target and tracking-only modes; 12/24-hour changes refresh historical meal display.
- Export includes all promised categories beyond 90 days and distinguishes cancellation from failure. Delete tests use disposable accounts with paginated storage and injected failures; verify local per-user history, weight, pending-delete caches and scan drafts are removed, including after restart; no misleading completion state.
- Notification denial, unsupported preview mode, token/registration failure and notification open after sign-in behave correctly.

Visual/accessibility acceptance:

- Capture matching viewport screenshots and compare side by side/overlay against the references after fixing fonts and data fixtures. Verify component order, alignment, spacing, card geometry, radio states and scroll extent; document intentional HaverTrack adaptations.
- Check small and large phones, iOS/Android builds, web layout, safe areas, keyboard behavior, large text, screen-reader labels/selected states, contrast and reduced motion.
- No decorative inactive controls, clipped row labels, hardcoded personal totals, inert pager dots or add-button/tab overlap.

Release gate: independent whole-code review; passing targeted behavioral tests and TypeScript; no newly introduced lint findings and resolution of relevant runtime hook defects; successful native/web smoke checks; database ownership tests where changed; fresh-log/redaction report; and completed reference-to-feature checklist. Keep production deployment separate from this planning deliverable.

**10. Deliverables, estimates and outstanding decisions**

Deliverables: verified reference inventory; component/token specification; route/feature checklist; migrated preference contracts; account/Units screens; selected dashboard/welcome implementation; reliable lifecycle features; operational log coverage; test and screenshot evidence; independent review report.

Planning estimate for core account/Units, Today redesign and reliability work: approximately 10–18 engineering days, overlapping where file ownership permits. This is an initial effort estimate, not a calendar commitment. Refine after full interior-screen inspection. Subscription, native health integrations, expanded reminders and a second welcome redesign add separate scope and external setup time.

Outstanding decisions: dashboard versus pre-auth welcome (clarification requested); complete unobserved MacroFactor interiors and cropped Distance options; whether Subscription/Integrations are actual product goals; production diagnostic destination; exact navigation parity versus retaining HaverTrack's DC menu tab. The remainder of the plan can proceed without inventing those answers.
