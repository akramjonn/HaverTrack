# Campus table design

The home page leads with food from today's Dining Center menu. Nutrition follows as a compact daily summary, alongside existing scanning, search, saved meals, hydration and history.

## References

Reviewed through the Mobbin MCP:
- [Kitchen Stories](https://mobbin.com/screens/fd41b792-0f75-4213-9da2-b863d0502534): editorial headline hierarchy and warm surfaces.
- [CREME](https://mobbin.com/screens/4210f0c8-2018-4ce2-9b94-58962846be9c): strong focus on one featured dish.
- [Blinkit](https://mobbin.com/screens/ae43b749-e5e9-4310-a8a5-769063efed1f): approachable illustrated food categories.

The implementation uses original SVG illustrations, butter yellow, forest green, cream and sage, with system serif editorial headlines and existing Outfit body typography. No reference screenshots or app assets are embedded.

## Featured meals

Only main dishes for the current campus date and DC location qualify. Explicit unavailable/unknown availability and old snapshots are excluded. The current service (including brunch at lunchtime) sorts first, followed by other services today. Dish names are deduplicated. Headlines adapt for sushi, pizza, tacos and pasta; exact menu names and service labels remain visible.

Tapping a feature or alternative opens a scrollable portion sheet with nutrition, dietary tags and allergens. Confirmation uses the existing `logMeal` path, retains serving identifiers, marks incomplete nutrition, prevents duplicate in-flight submissions, and reports offline saves. Availability is checked again at confirmation. A balance-score failure after a successful meal save is reported as a saved meal rather than inviting a duplicate retry.

## Review

`/design-preview` now includes Today with illustrative data and no featured-meal writes. Production hides the design preview. Validation: TypeScript, scoped ESLint, `scripts/test-featured-meal.ts`, existing meal-flow tests, and browser checks of the home page, details, portion recalculation and preview confirmation. The browser preview is not a live-account persistence test.
