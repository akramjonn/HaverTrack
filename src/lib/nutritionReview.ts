import type {
  Macros,
  Candidate,
} from "../../supabase/functions/_shared/nutrition";
export {
  macroKeys,
  servingGrams,
  scaleMacros,
  discrepancies,
} from "../../supabase/functions/_shared/nutrition";
export type {
  Macros,
  Candidate,
} from "../../supabase/functions/_shared/nutrition";
export interface NutritionReview {
  source_key: string;
  source: Macros & {
    dish_name: string;
    ingredients: string | null;
    serving_size: string | null;
    dietary_tags: string[];
    allergens: string[];
  };
  candidates: Candidate[];
  status: "pending" | "approved";
  lookup_error: string | null;
  checked_at: string | null;
  approved_macros: Macros | null;
  selected_candidate: Candidate | null;
  serving_grams: number | null;
  basis: "source" | "usda" | null;
  review_notes: string | null;
  reviewed_at: string | null;
  dietary_tags: string[];
  dietary_evidence: string | null;
}
export const dietaryFilters = [
  "Vegan",
  "Vegetarian",
  "Halal",
  "Kosher",
  "Gluten-Free",
];
export function canonicalDietaryTag(tag: string): string {
  const normalized = tag.toLowerCase().replace(/[\s_-]/g, "");
  return (
    dietaryFilters.find(
      (t) => t.toLowerCase().replace(/[\s_-]/g, "") === normalized,
    ) ?? tag
  );
}
export function matchesDiet(
  item: { dietary_tags: string[]; protein_g: number | null },
  tag: string | null,
) {
  return (
    !tag ||
    (tag.toLowerCase() === "high protein"
      ? (item.protein_g ?? 0) >= 20
      : item.dietary_tags.some((t) => canonicalDietaryTag(t) === tag))
  );
}
