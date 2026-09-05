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

/** Conservative rules. Staff overrides win; ambiguous dishes stay in the review queue. */
export function classifyDish(
  item: Pick<ParsedMenuItem, "dish_name" | "station_name"> & {
    course?: Course | null;
  },
) {
  if (item.course) return { course: item.course, needsReview: false };
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
      "main",
      /\b(chicken|turkey|beef|pork|salmon|tilapia|tofu|tempeh|burgers?|pizza|lasagna|enchiladas?|burritos?|sandwich|omelet|omelette|scrambled eggs?|pancakes?|waffles?|french toast|curry|stir fry|meatballs?|sausages?|fish|pasta|spaghetti|quiche|lentil stew|ribs|jack ?fruit|veggie griller)\b/,
    ],
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
