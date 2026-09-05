import { useLogStore, getTodayString } from '@/store/logStore';
import type { MealLog } from '@/store/logStore';
import { nutritionFromItems, scoreMeal } from '@/lib/health';
import { saveMealNutrients } from '@/lib/mealNutrients';
import type { FoodSearchResult } from '@/lib/foodSearch';

/**
 * The one place a meal gets written from every non-scan surface: quick add,
 * search, the DC menu, saved meals and build-a-plate all funnel through here so
 * they cannot drift apart.
 */

export type MealPeriod = MealLog['meal_period'];

export interface LoggableItem {
  id?: string;
  menu_item_id?: string | null;
  nutrislice_id?: number;
  location_id?: string;
  station_name?: string;
  course?: import('./mealFlow').Course;
  nutrition_complete?: boolean;
  name: string;
  portion: number;
  portion_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Undefined means unknown. Only complete sets are stored (see nutritionFromItems). */
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  saturated_fat_g?: number | null;
  is_estimate?: boolean;
}

export interface LogMealInput {
  eaten_at?: string;
  guided?: boolean;
  journey_id?: string;
  title: string;
  meal_period: MealPeriod;
  source: MealLog['source'];
  items: LoggableItem[];
  logged_date?: string;
  photo_path?: string | null;
}

export interface LogMealResult {
  mealLogId: string | null;
  /** Non-null when the meal saved but its balance score could not be stored. */
  nutrientError: string | null;
}

export function currentTimeLabel(date = new Date()) {
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
}

/** Meal period that matches the clock, used as the default on every log screen. */
export function periodForNow(date = new Date()): MealPeriod {
  const hours = date.getHours();
  if (hours < 10) return 'breakfast';
  if (hours < 15) return 'lunch';
  if (hours < 21) return 'dinner';
  return 'snack';
}

export async function logMeal(input: LogMealInput): Promise<LogMealResult> {
  const store = useLogStore.getState();

  const totals = input.items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein_g,
      carbs: acc.carbs + item.carbs_g,
      fat: acc.fat + item.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const created = await store.addMealLog({
    eaten_at: input.eaten_at ?? (input.logged_date && input.logged_date !== getTodayString() ? undefined : new Date().toISOString()),
    guided: input.guided,
    journey_id: input.journey_id,
    nutrition_complete: input.items.every(item => item.nutrition_complete !== false),
    title: input.title,
    meal_period: input.meal_period,
    logged_date: input.logged_date ?? getTodayString(),
    logged_time: currentTimeLabel(),
    total_calories: Math.round(totals.calories),
    total_protein_g: Math.round(totals.protein),
    total_carbs_g: Math.round(totals.carbs),
    total_fat_g: Math.round(totals.fat),
    source: input.source,
    photo_path: input.photo_path ?? null,
    items: input.items.map((item, index) => ({
      id: item.id ?? `${index}`,
      menu_item_id: item.menu_item_id,
      nutrislice_id: item.nutrislice_id,
      location_id: item.location_id,
      station_name: item.station_name,
      course: item.course,
      nutrition_complete: item.nutrition_complete,
      name: item.name,
      portion: item.portion,
      portion_unit: item.portion_unit,
      calories: Math.round(item.calories),
      protein_g: Math.round(item.protein_g),
      carbs_g: Math.round(item.carbs_g),
      fat_g: Math.round(item.fat_g),
      is_estimate: item.is_estimate ?? false,
    })),
  });

  const mealLogId = created?.id ?? null;

  const nutrition = nutritionFromItems(input.items);
  const score = scoreMeal(nutrition);

  const hasMicros =
    nutrition.fiber_g !== null ||
    nutrition.sugar_g !== null ||
    nutrition.sodium_mg !== null ||
    nutrition.saturated_fat_g !== null;

  let nutrientError: string | null = null;

  // A local id means the meal itself has not reached the server yet (offline);
  // there is no row to attach nutrients to, and the meal is queued regardless.
  if (mealLogId && !mealLogId.startsWith('local-') && (hasMicros || score)) {
    try {
      await saveMealNutrients({
        meal_log_id: mealLogId,
        fiber_g: nutrition.fiber_g ?? null,
        sugar_g: nutrition.sugar_g ?? null,
        sodium_mg: nutrition.sodium_mg ?? null,
        saturated_fat_g: nutrition.saturated_fat_g ?? null,
        health_score: score?.score ?? null,
        health_grade: score?.grade ?? null,
      });
    } catch (e: any) {
      nutrientError = `Meal saved, but its balance score did not: ${e?.message ?? 'unknown error'}`;
    }
  }

  return { mealLogId, nutrientError };
}

/**
 * Scales a search result to a quantity the student picked. DC dishes scale by
 * servings; packaged food scales by grams against its per-100 g values.
 */
export function scaleSearchResult(result: FoodSearchResult, quantity: number): LoggableItem | null {
  if (result.calories === null) return null;

  const factor = result.basis === 'per_100g' ? quantity / 100 : quantity;
  const scale = (value: number | null) => (value === null ? null : Math.round(value * factor * 10) / 10);

  return {
    name: result.name,
    portion: quantity,
    portion_unit: result.basis === 'per_100g' ? 'g' : result.serving_label,
    calories: Math.round(result.calories * factor),
    protein_g: scale(result.protein_g) ?? 0,
    carbs_g: scale(result.carbs_g) ?? 0,
    fat_g: scale(result.fat_g) ?? 0,
    fiber_g: scale(result.fiber_g),
    sugar_g: scale(result.sugar_g),
    sodium_mg: scale(result.sodium_mg),
    saturated_fat_g: scale(result.saturated_fat_g),
    is_estimate: result.source === 'openfoodfacts',
  };
}
