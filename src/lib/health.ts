/**
 * Meal balance score.
 *
 * Cal AI grades a plate; we do the same, but the score only ever describes the
 * *food*, never the person eating it (§11). Every component is derived from
 * published dietary reference intakes scaled to the meal's own calories, so a
 * 300 kcal snack and a 900 kcal dinner are judged on the same footing.
 *
 * Nothing is invented. A component that has no data is dropped and the
 * remaining weights are renormalised, and the result records how much of the
 * score was actually measurable so the UI can say so.
 */

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface MealNutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Optional micronutrients — undefined/null means "unknown", not zero. */
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  saturated_fat_g?: number | null;
}

export interface HealthComponent {
  key: 'protein' | 'fat' | 'fiber' | 'sodium' | 'sugar' | 'saturated_fat';
  label: string;
  /** 0–1, how well this component scored. */
  ratio: number;
  weight: number;
  detail: string;
}

export interface HealthScore {
  score: number; // 0–100
  grade: HealthGrade;
  components: HealthComponent[];
  /** Share of the total possible weight that we had data for, 0–1. */
  coverage: number;
  /** Plain-language summary of the biggest lever, or null if nothing stands out. */
  headline: string;
}

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Linear ramp: 0 at `worst`, 1 at `best`, clamped. Works in both directions. */
function ramp(value: number, worst: number, best: number) {
  if (best === worst) return 0;
  const t = (value - worst) / (best - worst);
  return Math.max(0, Math.min(1, t));
}

function known(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function gradeForScore(score: number): HealthGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

/**
 * Returns null when there is not enough information to say anything — an empty
 * plate or a meal with no calories gets no grade rather than a bad one.
 */
export function scoreMeal(meal: MealNutrition): HealthScore | null {
  const calories = Math.round(meal.calories);
  if (!Number.isFinite(calories) || calories <= 0) return null;

  const per1000 = 1000 / calories;
  const components: HealthComponent[] = [];

  // Protein share of energy. 20%+ of calories from protein is the satiety
  // threshold most sports-nutrition guidance uses for a main meal.
  const proteinKcal = meal.protein_g * KCAL_PER_G.protein;
  const proteinShare = proteinKcal / calories;
  components.push({
    key: 'protein',
    label: 'Protein',
    ratio: ramp(proteinShare, 0.05, 0.25),
    weight: 30,
    detail: `${Math.round(meal.protein_g)}g · ${Math.round(proteinShare * 100)}% of calories`,
  });

  // Fat share of energy. The AMDR tops out at 35%; we stop penalising below 30%
  // and bottom out at 55%, which is where a plate is mostly fried.
  const fatKcal = meal.fat_g * KCAL_PER_G.fat;
  const fatShare = fatKcal / calories;
  components.push({
    key: 'fat',
    label: 'Fat balance',
    ratio: ramp(fatShare, 0.55, 0.3),
    weight: 25,
    detail: `${Math.round(meal.fat_g)}g · ${Math.round(fatShare * 100)}% of calories`,
  });

  // Fiber: DGA recommends 14g per 1000 kcal.
  if (known(meal.fiber_g)) {
    const fiberPer1000 = meal.fiber_g * per1000;
    components.push({
      key: 'fiber',
      label: 'Fiber',
      ratio: ramp(fiberPer1000, 2, 14),
      weight: 20,
      detail: `${meal.fiber_g.toFixed(1)}g · ${Math.round(fiberPer1000)}g per 1000 kcal`,
    });
  }

  // Sodium: 2300mg/day against a 2000 kcal reference = 1150mg per 1000 kcal.
  if (known(meal.sodium_mg)) {
    const sodiumPer1000 = meal.sodium_mg * per1000;
    components.push({
      key: 'sodium',
      label: 'Sodium',
      ratio: ramp(sodiumPer1000, 2300, 900),
      weight: 15,
      detail: `${Math.round(meal.sodium_mg)}mg · ${Math.round(sodiumPer1000)}mg per 1000 kcal`,
    });
  }

  // Saturated fat: under 10% of calories.
  if (known(meal.saturated_fat_g)) {
    const satShare = (meal.saturated_fat_g * KCAL_PER_G.fat) / calories;
    components.push({
      key: 'saturated_fat',
      label: 'Saturated fat',
      ratio: ramp(satShare, 0.2, 0.07),
      weight: 10,
      detail: `${meal.saturated_fat_g.toFixed(1)}g · ${Math.round(satShare * 100)}% of calories`,
    });
  }

  // Sugar: 10% of calories is the WHO free-sugars ceiling. Total sugar overstates
  // it (fruit and milk count), so this carries the smallest weight of all.
  if (known(meal.sugar_g)) {
    const sugarShare = (meal.sugar_g * KCAL_PER_G.carbs) / calories;
    components.push({
      key: 'sugar',
      label: 'Sugar',
      ratio: ramp(sugarShare, 0.3, 0.08),
      weight: 10,
      detail: `${meal.sugar_g.toFixed(1)}g · ${Math.round(sugarShare * 100)}% of calories`,
    });
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const earned = components.reduce((sum, c) => sum + c.ratio * c.weight, 0);
  const score = Math.round((earned / totalWeight) * 100);

  // Coverage is measured against every component we could ever compute (110).
  const MAX_POSSIBLE_WEIGHT = 110;
  const coverage = totalWeight / MAX_POSSIBLE_WEIGHT;

  const weakest = [...components].sort((a, b) => a.ratio - b.ratio)[0];
  const strongest = [...components].sort((a, b) => b.ratio - a.ratio)[0];

  const headline =
    weakest && weakest.ratio < 0.5
      ? HEADLINES_LOW[weakest.key]
      : strongest
        ? HEADLINES_HIGH[strongest.key]
        : 'Balanced across everything we can measure.';

  return {
    score,
    grade: gradeForScore(score),
    components,
    coverage,
    headline,
  };
}

/**
 * Copy is descriptive, never disciplinary — no "bad", no "cheat", no guilt (§11).
 */
const HEADLINES_LOW: Record<HealthComponent['key'], string> = {
  protein: 'Light on protein for its size — a side of eggs, beans or chicken would even it out.',
  fat: 'Most of these calories come from fat.',
  fiber: 'Low in fiber — vegetables, fruit or whole grains would add some.',
  sodium: 'Salty for its calorie count. Worth some water alongside.',
  sugar: 'A lot of the carbohydrate here is sugar.',
  saturated_fat: 'High share of saturated fat.',
};

const HEADLINES_HIGH: Record<HealthComponent['key'], string> = {
  protein: 'Strong protein for its calories.',
  fat: 'Well-balanced fat for its calories.',
  fiber: 'Good fiber for its calories.',
  sodium: 'Easy on the sodium.',
  sugar: 'Low in sugar.',
  saturated_fat: 'Low in saturated fat.',
};

/** Sums a meal's items into the shape `scoreMeal` wants. */
export function nutritionFromItems(
  items: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g?: number | null;
    sugar_g?: number | null;
    sodium_mg?: number | null;
    saturated_fat_g?: number | null;
  }[]
): MealNutrition {
  /** Sums a micronutrient only if every item reports it — a partial sum would understate it. */
  const sumIfComplete = (key: 'fiber_g' | 'sugar_g' | 'sodium_mg' | 'saturated_fat_g') => {
    if (!items.length) return null;
    let total = 0;
    for (const item of items) {
      const value = item[key];
      if (!known(value)) return null;
      total += value;
    }
    return Math.round(total * 10) / 10;
  };

  return {
    calories: items.reduce((sum, i) => sum + i.calories, 0),
    protein_g: items.reduce((sum, i) => sum + i.protein_g, 0),
    carbs_g: items.reduce((sum, i) => sum + i.carbs_g, 0),
    fat_g: items.reduce((sum, i) => sum + i.fat_g, 0),
    fiber_g: sumIfComplete('fiber_g'),
    sugar_g: sumIfComplete('sugar_g'),
    sodium_mg: sumIfComplete('sodium_mg'),
    saturated_fat_g: sumIfComplete('saturated_fat_g'),
  };
}
