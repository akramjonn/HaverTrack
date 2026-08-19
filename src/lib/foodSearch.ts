import { z } from 'zod';
import { supabase } from '@/lib/supabase';

/**
 * One search box over two very different sources: the Haverford DC menu (our own
 * Postgres, matched with the pg_trgm index on menu_items.dish_name) and
 * OpenFoodFacts for anything that came out of a wrapper.
 *
 * Neither source is allowed to fake the other's shape. DC dishes are priced per
 * *serving*; OpenFoodFacts is priced per *100 g*. `basis` says which, and the
 * logging screens do the arithmetic in the open.
 */

export type FoodSource = 'menu' | 'openfoodfacts';
export type NutritionBasis = 'serving' | 'per_100g';

export interface FoodSearchResult {
  /** Stable list key. */
  key: string;
  source: FoodSource;
  name: string;
  subtitle: string;
  basis: NutritionBasis;
  /** Human label for one unit of `basis`, e.g. "4 oz" or "100 g". */
  serving_label: string;
  /** Null means unknown — never coerced to 0 (§7). */
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
  nutrislice_id: number | null;
  barcode: string | null;
  station_name: string | null;
  meal_period: string | null;
  served_date: string | null;
  dietary_tags: string[];
  allergens: string[];
}

export interface FoodSearchResponse {
  results: FoodSearchResult[];
  /** Per-source failures. Shown to the user; never silently dropped. */
  errors: { menu?: string; openfoodfacts?: string };
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

// ---------------------------------------------------------------------------
// DC menu
// ---------------------------------------------------------------------------

export async function searchMenuItems(
  query: string,
  options: { servedOn?: string | null; limit?: number } = {}
): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase.rpc('search_menu_items', {
    q,
    served_on: options.servedOn ?? null,
    max_results: options.limit ?? 30,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    key: `menu-${row.id}`,
    source: 'menu' as const,
    name: row.dish_name,
    subtitle: [row.station_name, row.meal_period].filter(Boolean).join(' · '),
    basis: 'serving' as const,
    serving_label: row.serving_size || '1 serving',
    calories: num(row.calories),
    protein_g: num(row.protein_g),
    carbs_g: num(row.carbs_g),
    fat_g: num(row.fat_g),
    // Nutrislice does not publish these for Haverford, so they stay unknown.
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    saturated_fat_g: null,
    nutrislice_id: num(row.nutrislice_id),
    barcode: null,
    station_name: row.station_name ?? null,
    meal_period: row.meal_period ?? null,
    served_date: row.served_date ?? null,
    dietary_tags: row.dietary_tags ?? [],
    allergens: row.allergens ?? [],
  }));
}

// ---------------------------------------------------------------------------
// OpenFoodFacts
// ---------------------------------------------------------------------------

const OffHitSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().optional(),
  brands: z.union([z.string(), z.array(z.string())]).optional(),
  quantity: z.string().optional(),
  nutriments: z.record(z.string(), z.unknown()).optional(),
});

const OffSearchSchema = z.object({
  hits: z.array(OffHitSchema).default([]),
});

/**
 * OpenFoodFacts free-text search (the Search-a-licious service). The legacy
 * `cgi/search.pl` endpoint is rate-limited to the point of being unusable from a
 * phone, so this uses the supported search host. Values are per 100 g.
 */
export async function searchOpenFoodFacts(
  query: string,
  limit = 15
): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({
    q,
    page_size: String(limit),
    fields: 'code,product_name,brands,quantity,nutriments',
  });

  const res = await fetch(`https://search.openfoodfacts.org/search?${params.toString()}`, {
    headers: { 'User-Agent': 'SquirrelTrack/1.0 (Haverford College student project)' },
  });

  if (!res.ok) {
    throw new Error(`OpenFoodFacts returned ${res.status}`);
  }

  const parsed = OffSearchSchema.parse(await res.json());

  return parsed.hits
    .filter((hit) => hit.product_name && hit.product_name.trim().length > 0)
    .map((hit) => {
      const n = (hit.nutriments ?? {}) as Record<string, unknown>;
      const brand = Array.isArray(hit.brands) ? hit.brands[0] : hit.brands;
      // OpenFoodFacts reports sodium in grams per 100 g.
      const sodiumG = num(n['sodium_100g']);

      return {
        key: `off-${hit.code ?? hit.product_name}`,
        source: 'openfoodfacts' as const,
        name: hit.product_name!.trim(),
        subtitle: [brand, hit.quantity].filter(Boolean).join(' · ') || 'OpenFoodFacts',
        basis: 'per_100g' as const,
        serving_label: '100 g',
        calories: num(n['energy-kcal_100g']) === null ? null : Math.round(num(n['energy-kcal_100g'])!),
        protein_g: round1(num(n['proteins_100g'])),
        carbs_g: round1(num(n['carbohydrates_100g'])),
        fat_g: round1(num(n['fat_100g'])),
        fiber_g: round1(num(n['fiber_100g'])),
        sugar_g: round1(num(n['sugars_100g'])),
        sodium_mg: sodiumG === null ? null : Math.round(sodiumG * 1000),
        saturated_fat_g: round1(num(n['saturated-fat_100g'])),
        nutrislice_id: null,
        barcode: hit.code ?? null,
        station_name: null,
        meal_period: null,
        served_date: null,
        dietary_tags: [],
        allergens: [],
      };
    })
    // A result with no calories cannot be logged, so it is noise in this list.
    .filter((r) => r.calories !== null);
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export async function searchFoods(
  query: string,
  options: { servedOn?: string | null; includePackaged?: boolean } = {}
): Promise<FoodSearchResponse> {
  const q = query.trim();
  if (q.length < 2) return { results: [], errors: {} };

  const includePackaged = options.includePackaged ?? true;

  const [menu, off] = await Promise.allSettled([
    searchMenuItems(q, { servedOn: options.servedOn ?? null }),
    includePackaged ? searchOpenFoodFacts(q) : Promise.resolve([] as FoodSearchResult[]),
  ]);

  const errors: FoodSearchResponse['errors'] = {};
  const results: FoodSearchResult[] = [];

  if (menu.status === 'fulfilled') results.push(...menu.value);
  else errors.menu = `DC menu search failed: ${menu.reason?.message ?? 'unknown error'}`;

  if (off.status === 'fulfilled') results.push(...off.value);
  else
    errors.openfoodfacts = `Packaged-food search failed: ${off.reason?.message ?? 'unknown error'}. Check your connection.`;

  return { results, errors };
}
