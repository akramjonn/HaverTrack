# Nutrition review

Open **Developer dashboard → Nutrition review** (`/admin/nutrition`). Pick a service date to inspect every food version used that day. Search foods or ingredients; use Needs review, Flagged, Published, or All foods.

Every menu write creates a review keyed to the exact source identity, ingredients, description, serving, macros, dietary labels, and allergens. Unchanged syncs preserve approvals. Changed source data points to a new pending review; the old record and audit remain. Raw `menu_items` nutrition is never overwritten. `reviewed_menu_items` publishes approved values to the app and photo analysis. Existing logged meals remain snapshots.

## USDA setup

Get a FoodData Central API key at https://fdc.nal.usda.gov/api-key-signup.html and add `USDA_API_KEY` in Supabase **Edge Functions → Secrets**. Never use an `EXPO_PUBLIC_` variable or commit the key. Local `.env` can also hold `USDA_API_KEY`; `node --import tsx scripts/setup-nutrition.ts` installs only this migration, sets the key if supplied, and deploys the three affected functions. `--check` reports configuration without printing secrets. This repository uses `public.schema_migrations` for migration tracking.

Without a key, the page still displays source values and internal discrepancy flags. USDA lookups report the missing configuration; nothing is silently marked reviewed. Each successful 15-minute menu sync checks up to eight unchecked food versions. The dashboard can run another batch or retry a specific food with a refined search. Errors are retained for review. Completed lookups are cached by source version; failed versions can be retried individually. No user, meal-log, or health data is sent to USDA: only food-search text.

## Reviewing

For an existing installation, the setup script can reuse the legacy barcode USDA key as a server secret. The review feature never reads that key in the app. Bootstrap current menu comparisons with `node --import tsx scripts/check-nutrition.ts --sync` (up to 400 unchecked current food versions). Publishing remains a human review action.

1. Select a USDA reference with matching food and preparation. Search candidates are suggestions, not verified recipe matches.
2. Supply the weight in grams of **one listed dining serving**. Only explicit g/kg/oz weights are parsed automatically; cup, bowl, piece, and fluid-ounce measures require measured weight.
3. Inspect original versus USDA per-serving macros and differences. Flags use >25% with a floor of 50 kcal or 5 g, and an internal calorie/macro check. These thresholds flag review candidates, not established errors.
4. Choose **Keep dining values** or **Use USDA estimate**. Document the food match, preparation, and serving-weight evidence. Notes appear to students.
5. Add dietary labels only with certification or dining-service evidence, then attest and publish. All four macro values and a USDA comparison are required. Only administrators can publish; clients cannot directly write review records.

Student food details show macro tiles, review status, original-versus-reference values, serving weight, notes, review date, dietary evidence, and a USDA link. USDA substitutions are labeled estimates. Filters support Vegan, Vegetarian, Halal, Kosher, and Gluten-Free. No label is inferred from the absence of an allergen; wheat-free is not gluten-free. Ingredient exclusions search supplied ingredient text and hide unknown ingredient lists, but cannot determine cross-contact or certification.

## Verification

- `node --import tsx scripts/test-nutrition.ts`
- `node --import tsx scripts/test-meal-feedback-db.ts` against disposable PostgreSQL on port 55439; includes migration, nutrition permissions, publishing, source preservation, and invalidation tests.
- `npx tsc --noEmit`

References: [USDA API](https://fdc.nal.usda.gov/api-guide/), [USDA dataset definitions](https://fdc.nal.usda.gov/data-documentation/).
