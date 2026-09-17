import type { ParsedMenuItem } from "./nutrislice";

export const COURSES = [
  "main",
  "appetizer",
  "side",
  "drink",
  "dessert",
  "condiment",
  "other",
] as const;
export type Course = (typeof COURSES)[number];
export const COURSE_LABELS: Record<Course, string> = {
  main: "Main dishes",
  appetizer: "Appetizers & soups",
  side: "Sides & salads",
  drink: "Drinks",
  dessert: "Something sweet",
  condiment: "Finishing touches",
  other: "More to enjoy",
};

export function isMainLineFirst(item: { station_name: string; source_order?: number | null }) {
  return /\bmain\s*line\b/i.test(item.station_name) && item.source_order === 0;
}
export function compareMenuOrder(a: ParsedMenuItem, b: ParsedMenuItem) {
  return Number(isMainLineFirst(b)) - Number(isMainLineFirst(a)) ||
    a.station_name.localeCompare(b.station_name) ||
    (a.source_order ?? Number.MAX_SAFE_INTEGER) - (b.source_order ?? Number.MAX_SAFE_INTEGER) ||
    a.dish_name.localeCompare(b.dish_name);
}
/** Display categories come directly from the dining menu's section headers. */
export function menuSections(items: ParsedMenuItem[]) {
  const sections = new Map<string, ParsedMenuItem[]>();
  for (const item of [...items].sort(compareMenuOrder)) {
    const name = item.station_name || 'Other foods';
    sections.set(name, [...(sections.get(name) ?? []), item]);
  }
  return [...sections].map(([name, foods]) => ({ name, foods }));
}
/** Only the first Main Line food is the main. Course hints remain for icons/logging. */
export function classifyDish(
  item: Pick<ParsedMenuItem, "dish_name" | "station_name"> & {
    course?: Course | null;
    source_order?: number | null;
  },
) {
  if (isMainLineFirst(item)) return { course: 'main' as Course, needsReview: false };
  if (item.course && item.course !== 'main') return { course: item.course, needsReview: false };
  const name = item.dish_name.toLowerCase();
  const rules: [Course, RegExp][] = [
    [
      "condiment",
      /^(?:(?:house|bbq|alfredo|pesto|tomato|marinara|hot|soy|ranch|italian)\s+)*(?:ketchup|mustard|dressing|sauce|syrup|butter|mayonnaise|salt|pepper|salsa|honey|marinara|grated parmesan)$/,
    ],
    ["drink", /\b(juice|coffee|tea|milk|lemonade|water|soda|smoothie)\b/],
    [
      "dessert",
      /\b(cookie|cake|brownie|ice cream|pudding|pie|cobbler|mousse|sorbet|cupcake)\b/,
    ],
    ["appetizer", /\b(soup|bisque|broth|spring roll|hummus)\b/],
    [
      "side",
      /\b(rice|potato|fries|broccoli|carrot|corn|peas|beans|salad|spinach|greens|fruit|apple|banana|bread|roll|quinoa|couscous|vegetables|yogurt|oatmeal|cereal)\b/,
    ],
  ];
  for (const [course, pattern] of rules)
    if (pattern.test(name)) return { course, needsReview: true };
  return { course: "other" as Course, needsReview: true };
}

export function servingKey(item: ParsedMenuItem) {
  return [
    item.location_id,
    item.served_date,
    item.meal_period,
    item.station_id ?? item.station_name,
    item.nutrislice_id,
  ].join("|");
}

export function campusPeriod(now = new Date()): ParsedMenuItem["meal_period"] {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour < 10 ? "breakfast" : hour < 15 ? "lunch" : "dinner";
}

export function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

export function isRating(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
