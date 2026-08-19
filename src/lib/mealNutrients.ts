import { supabase } from '@/lib/supabase';
import type { HealthGrade } from '@/lib/health';

/**
 * Micronutrients and the balance score for a whole meal.
 *
 * These live in their own table (public.meal_log_nutrients) keyed by meal_log_id
 * rather than on meal_logs, so the existing meal repository keeps working
 * untouched and a meal with no micronutrient data simply has no row.
 */
export interface MealNutrientRow {
  meal_log_id: string;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
  health_score: number | null;
  health_grade: HealthGrade | null;
}

const COLUMNS =
  'meal_log_id, fiber_g, sugar_g, sodium_mg, saturated_fat_g, health_score, health_grade';

function toRow(row: any): MealNutrientRow {
  const n = (v: any) => (v === null || v === undefined ? null : Number(v));
  return {
    meal_log_id: row.meal_log_id,
    fiber_g: n(row.fiber_g),
    sugar_g: n(row.sugar_g),
    sodium_mg: n(row.sodium_mg),
    saturated_fat_g: n(row.saturated_fat_g),
    health_score: n(row.health_score),
    health_grade: (row.health_grade ?? null) as HealthGrade | null,
  };
}

export async function fetchMealNutrients(mealLogIds: string[]): Promise<Map<string, MealNutrientRow>> {
  const ids = mealLogIds.filter((id) => id && !id.startsWith('local-'));
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from('meal_log_nutrients')
    .select(COLUMNS)
    .in('meal_log_id', ids);

  if (error) throw new Error(error.message);

  const map = new Map<string, MealNutrientRow>();
  for (const row of data ?? []) {
    const parsed = toRow(row);
    map.set(parsed.meal_log_id, parsed);
  }
  return map;
}

export async function saveMealNutrients(row: MealNutrientRow) {
  const { error } = await supabase.from('meal_log_nutrients').upsert(
    {
      meal_log_id: row.meal_log_id,
      fiber_g: row.fiber_g,
      sugar_g: row.sugar_g,
      sodium_mg: row.sodium_mg,
      saturated_fat_g: row.saturated_fat_g,
      health_score: row.health_score,
      health_grade: row.health_grade,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'meal_log_id' }
  );

  if (error) throw new Error(error.message);
}
