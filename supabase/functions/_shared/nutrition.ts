export const macroKeys = ["calories", "protein_g", "carbs_g", "fat_g"] as const;
export type Macros = Record<(typeof macroKeys)[number], number | null>;
export type Candidate = {
  fdcId: number;
  description: string;
  dataType: string;
  macros: Macros;
};
export function servingGrams(value: string | null): number | null {
  const m = value
    ?.trim()
    .match(/^(\d+(?:\.\d+)?)\s*(g|grams?|kg|oz|ounces?)$/i);
  if (!m) return null;
  const n =
    Number(m[1]) *
    (/kg/i.test(m[2]) ? 1000 : /oz|ounce/i.test(m[2]) ? 28.349523125 : 1);
  return n > 0 && n <= 10000 ? n : null;
}
export function scaleMacros(macros: Macros, grams: number): Macros {
  return Object.fromEntries(
    macroKeys.map((k) => [
      k,
      macros[k] == null ? null : Math.round(macros[k]! * grams) / 100,
    ]),
  ) as Macros;
}
export function discrepancies(
  source: Macros,
  reference?: Macros | null,
): string[] {
  const reasons: string[] = [];
  if (macroKeys.some((k) => source[k] == null))
    reasons.push("Nutrition is incomplete");
  if (
    macroKeys.some(
      (k) =>
        source[k] != null && (!Number.isFinite(source[k]) || source[k]! < 0),
    )
  )
    reasons.push("Invalid nutrition value");
  if (macroKeys.every((k) => source[k] != null)) {
    const energy =
      4 * source.protein_g! + 4 * source.carbs_g! + 9 * source.fat_g!;
    if (Math.abs(source.calories! - energy) > Math.max(50, energy * 0.25))
      reasons.push("Calories do not align with the macros");
  }
  if (reference)
    for (const key of macroKeys) {
      if (
        source[key] != null &&
        reference[key] != null &&
        Math.abs(source[key]! - reference[key]!) >
          Math.max(key === "calories" ? 50 : 5, reference[key]! * 0.25)
      )
        reasons.push(`${key}: differs from USDA reference`);
    }
  return reasons;
}
// Food Search nutrients are per 100 g. Match nutrient IDs and units, never array order.
export function parseCandidate(food: any): Candidate {
  const nutrient = (ids: number[], unit: string) => {
    for (const id of ids) {
      const n = food.foodNutrients?.find(
        (n: any) => n.nutrientId === id && n.unitName?.toLowerCase() === unit,
      );
      if (
        typeof n?.value === "number" &&
        Number.isFinite(n.value) &&
        n.value >= 0
      )
        return n.value;
    }
    return null;
  };
  return {
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType,
    macros: {
      calories: nutrient([1008, 2048, 2047], "kcal"),
      protein_g: nutrient([1003], "g"),
      carbs_g: nutrient([1005], "g"),
      fat_g: nutrient([1004], "g"),
    },
  };
}
