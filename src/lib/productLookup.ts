import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { FoodSearchResult } from '@/lib/foodSearch';

/**
 * Packaged-food barcode resolution.
 *
 * Chain: local cache → OpenFoodFacts → USDA FoodData Central (Branded).
 * Verified live against real UPCs: OpenFoodFacts has the EU/international
 * catalog (e.g. 5000159461122, Snickers UK) but misses some US-market codes;
 * USDA FDC is the authoritative US branded-food label database and resolved
 * one of those misses (040000503781, Snickers Minis) with full macros. Two
 * sources, two different strengths — neither alone is enough for a campus
 * where students are scanning US snacks.
 *
 * Nothing here fabricates a product. A source that times out or errors is
 * skipped, not retried into a guess; an exhausted chain returns null and the
 * caller offers manual entry.
 */

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  serving_size?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Unknown stays null — never coerced to 0, same rule as the rest of the app. */
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
  /** What the macro fields above are measured against. */
  basis: 'serving' | 'per_100g';
  source: 'off' | 'fdc' | 'cache';
}

const FETCH_TIMEOUT_MS = 4000;
const USER_AGENT = 'HaverTrack/1.0 (Haverford College student project)';

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Barcode scanners and manual entry both produce UPC-A (12), EAN-13 (13), or
 * occasionally UPC-E (8) strings, but a single physical product can be filed
 * under more than one of these in a given database — most commonly EAN-13
 * with a leading zero versus the UPC-A with that zero stripped. Trying every
 * plausible variant before declaring a miss is what makes the difference
 * between "OpenFoodFacts doesn't have this" and "this barcode was scanned
 * with the wrong padding."
 */
function barcodeVariants(raw: string): string[] {
  const digits = raw.trim().replace(/\D/g, '');
  if (!digits) return [];

  const variants = new Set<string>([digits]);

  const stripped = digits.replace(/^0+/, '') || '0';
  variants.add(stripped);

  if (digits.length === 13 && digits.startsWith('0')) {
    variants.add(digits.slice(1)); // EAN-13 -> UPC-A
  }
  if (digits.length === 12) {
    variants.add(`0${digits}`); // UPC-A -> EAN-13
  }

  for (const width of [12, 13, 14] as const) {
    if (stripped.length <= width) variants.add(stripped.padStart(width, '0'));
  }

  return [...variants];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheRow {
  barcode: string;
  name: string | null;
  brand: string | null;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
  basis: 'serving' | 'per_100g' | null;
  source: 'off' | 'fdc' | 'miss';
  hit_count: number;
}

async function readCache(rawCode: string): Promise<CacheRow | null> {
  const { data, error } = await supabase
    .from('barcode_cache')
    .select('*')
    .eq('barcode', rawCode)
    .maybeSingle();

  if (error) {
    console.warn('Barcode cache read failed:', error.message);
    return null;
  }
  return data as CacheRow | null;
}

async function bumpCacheHit(rawCode: string, current: CacheRow) {
  const { error } = await supabase
    .from('barcode_cache')
    .update({ hit_count: current.hit_count + 1, last_hit_at: new Date().toISOString() })
    .eq('barcode', rawCode);

  if (error) console.warn('Barcode cache hit-count update failed:', error.message);
}

async function writeCache(rawCode: string, product: BarcodeProduct | null) {
  const row = {
    barcode: rawCode,
    name: product?.name ?? null,
    brand: product?.brand ?? null,
    serving_size: product?.serving_size ?? null,
    calories: product?.calories ?? null,
    protein_g: product?.protein_g ?? null,
    carbs_g: product?.carbs_g ?? null,
    fat_g: product?.fat_g ?? null,
    fiber_g: product?.fiber_g ?? null,
    sugar_g: product?.sugar_g ?? null,
    sodium_mg: product?.sodium_mg ?? null,
    saturated_fat_g: product?.saturated_fat_g ?? null,
    basis: product?.basis ?? null,
    source: product ? (product.source === 'cache' ? 'off' : product.source) : ('miss' as const),
  };

  // Best-effort: a cache write failing must never fail the lookup that just
  // succeeded for the person holding the product in front of the camera.
  const { error } = await supabase.from('barcode_cache').upsert(row, { onConflict: 'barcode' });
  if (error) console.warn('Barcode cache write failed:', error.message);
}

function cacheRowToProduct(row: CacheRow): BarcodeProduct | null {
  if (row.source === 'miss' || row.calories === null) return null;
  return {
    barcode: row.barcode,
    name: row.name || 'Packaged Item',
    brand: row.brand ?? undefined,
    serving_size: row.serving_size ?? undefined,
    calories: row.calories,
    protein_g: row.protein_g ?? 0,
    carbs_g: row.carbs_g ?? 0,
    fat_g: row.fat_g ?? 0,
    fiber_g: row.fiber_g,
    sugar_g: row.sugar_g,
    sodium_mg: row.sodium_mg,
    saturated_fat_g: row.saturated_fat_g,
    basis: row.basis ?? 'serving',
    source: 'cache',
  };
}

// ---------------------------------------------------------------------------
// OpenFoodFacts
// ---------------------------------------------------------------------------

const OffProductSchema = z.object({
  product_name: z.string().optional(),
  brands: z.string().optional(),
  serving_size: z.string().optional(),
  nutriments: z.record(z.string(), z.unknown()).optional(),
});

async function lookupOff(code: string): Promise<BarcodeProduct | null> {
  const res = await fetchWithTimeout(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res || !res.ok) return null;

  let data: any;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (data.status !== 1 || !data.product) return null;

  const parsed = OffProductSchema.safeParse(data.product);
  if (!parsed.success) return null;

  const n = (parsed.data.nutriments ?? {}) as Record<string, unknown>;
  const num = (key: string): number | null => {
    const v = n[key];
    const parsedNum = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(parsedNum) ? parsedNum : null;
  };

  const hasPerServing = num('energy-kcal_serving') !== null;
  const basis: BarcodeProduct['basis'] = hasPerServing ? 'serving' : 'per_100g';
  const suffix = hasPerServing ? '_serving' : '_100g';

  const calories = num(`energy-kcal${suffix}`);
  if (calories === null) return null;

  const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  // OpenFoodFacts reports sodium in grams; the app stores milligrams throughout.
  const sodiumG = num(`sodium${suffix}`);

  return {
    barcode: code,
    name: parsed.data.product_name?.trim() || 'Packaged Item',
    brand: parsed.data.brands,
    serving_size: hasPerServing ? parsed.data.serving_size : '100 g',
    calories: Math.round(calories),
    protein_g: round1(num(`proteins${suffix}`)) ?? 0,
    carbs_g: round1(num(`carbohydrates${suffix}`)) ?? 0,
    fat_g: round1(num(`fat${suffix}`)) ?? 0,
    fiber_g: round1(num(`fiber${suffix}`)),
    sugar_g: round1(num(`sugars${suffix}`)),
    sodium_mg: sodiumG === null ? null : Math.round(sodiumG * 1000),
    saturated_fat_g: round1(num(`saturated-fat${suffix}`)),
    basis,
    source: 'off',
  };
}

// ---------------------------------------------------------------------------
// USDA FoodData Central
// ---------------------------------------------------------------------------

const FdcNutrientSchema = z.object({
  nutrientName: z.string().optional(),
  value: z.number().optional(),
});

const FdcFoodSchema = z.object({
  description: z.string().optional(),
  brandOwner: z.string().optional(),
  brandName: z.string().optional(),
  gtinUpc: z.string().optional(),
  servingSize: z.number().optional(),
  servingSizeUnit: z.string().optional(),
  foodNutrients: z.array(FdcNutrientSchema).default([]),
});

const FdcSearchSchema = z.object({
  foods: z.array(FdcFoodSchema).default([]),
});

const FDC_NUTRIENT_MAP: Record<string, keyof Pick<
  BarcodeProduct,
  'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g' | 'sodium_mg' | 'saturated_fat_g'
>> = {
  Energy: 'calories',
  Protein: 'protein_g',
  'Carbohydrate, by difference': 'carbs_g',
  'Total lipid (fat)': 'fat_g',
  'Fiber, total dietary': 'fiber_g',
  'Sugars, total including NLEA': 'sugar_g',
  'Sodium, Na': 'sodium_mg',
  'Fatty acids, total saturated': 'saturated_fat_g',
};

/**
 * FDC Branded foods are indexed per 100 g. There is no exact UPC field filter
 * on the public search endpoint, so the barcode is matched as free-text query
 * — and verified live that USDA's search is sensitive to padding: querying
 * with a 13-digit EAN form of a real UPC returns zero hits, while the bare
 * 12-digit UPC-A form returns a confirmed match for the identical product.
 * So every variant is tried as the query, not just used to confirm a hit
 * found under a single query — and whatever comes back is still confirmed by
 * comparing `gtinUpc` against every variant, so a same-named different
 * product never slips through as a match.
 */
async function queryFdc(
  query: string,
  variantSet: Set<string>,
  apiKey: string
): Promise<ReturnType<typeof FdcFoodSchema.parse> | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    dataType: 'Branded',
    pageSize: '5',
  });

  const res = await fetchWithTimeout(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`);
  if (!res || !res.ok) return null;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const parsed = FdcSearchSchema.safeParse(data);
  if (!parsed.success) return null;

  return (
    parsed.data.foods.find((f) => f.gtinUpc && variantSet.has(f.gtinUpc.replace(/\D/g, ''))) ?? null
  );
}

async function lookupFdc(code: string, variants: string[]): Promise<BarcodeProduct | null> {
  const apiKey = process.env.EXPO_PUBLIC_USDA_FDC_KEY;
  if (!apiKey) {
    console.warn('EXPO_PUBLIC_USDA_FDC_KEY not set — skipping USDA FoodData Central.');
    return null;
  }

  const variantSet = new Set(variants);

  let match: ReturnType<typeof FdcFoodSchema.parse> | null = null;
  for (const variant of variants) {
    match = await queryFdc(variant, variantSet, apiKey);
    if (match) break;
  }
  if (!match) return null;

  const result: Partial<BarcodeProduct> = {
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    saturated_fat_g: null,
  };

  for (const nutrient of match.foodNutrients) {
    const field = nutrient.nutrientName ? FDC_NUTRIENT_MAP[nutrient.nutrientName] : undefined;
    if (!field || nutrient.value === undefined) continue;
    (result as any)[field] = Math.round(nutrient.value * 10) / 10;
  }

  if (result.calories === undefined) return null;

  const servingLabel =
    match.servingSize && match.servingSizeUnit
      ? `${match.servingSize} ${match.servingSizeUnit}`
      : '100 g';

  return {
    barcode: code,
    name: match.description?.trim() || 'Packaged Item',
    brand: match.brandOwner || match.brandName,
    serving_size: servingLabel,
    calories: Math.round(result.calories),
    protein_g: result.protein_g ?? 0,
    carbs_g: result.carbs_g ?? 0,
    fat_g: result.fat_g ?? 0,
    fiber_g: result.fiber_g ?? null,
    sugar_g: result.sugar_g ?? null,
    sodium_mg: result.sodium_mg ?? null,
    saturated_fat_g: result.saturated_fat_g ?? null,
    basis: 'per_100g',
    source: 'fdc',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a scanned or hand-typed barcode to a packaged product. Signature
 * kept stable (barcode: string) => Promise<BarcodeProduct | null>) since
 * src/app/scan.tsx's call site depends on it.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const rawCode = barcode.trim();
  if (!rawCode) return null;

  const cached = await readCache(rawCode);
  if (cached) {
    if (cached.source !== 'miss') void bumpCacheHit(rawCode, cached);
    return cacheRowToProduct(cached);
  }

  const variants = barcodeVariants(rawCode);
  if (!variants.length) return null;

  let product: BarcodeProduct | null = null;
  for (const variant of variants) {
    product = await lookupOff(variant);
    if (product) break;
  }

  if (!product) {
    product = await lookupFdc(rawCode, variants);
  }

  await writeCache(rawCode, product);
  return product ? { ...product, barcode: rawCode } : null;
}

/**
 * Adapts a resolved product into the same shape food search results already
 * use, so a barcode hit can go through the existing portion/meal-period/log
 * composer (`FoodComposeSheet`, `scaleSearchResult`, `logMeal`) instead of a
 * separate write path.
 */
export function barcodeProductToSearchResult(product: BarcodeProduct): FoodSearchResult {
  return {
    key: `barcode-${product.barcode}`,
    source: 'openfoodfacts',
    name: product.name,
    subtitle: [product.brand, product.source === 'fdc' ? 'USDA' : 'OpenFoodFacts']
      .filter(Boolean)
      .join(' · '),
    basis: product.basis === 'serving' ? 'serving' : 'per_100g',
    serving_label: product.serving_size || (product.basis === 'serving' ? '1 package' : '100 g'),
    calories: product.calories,
    protein_g: product.protein_g,
    carbs_g: product.carbs_g,
    fat_g: product.fat_g,
    fiber_g: product.fiber_g,
    sugar_g: product.sugar_g,
    sodium_mg: product.sodium_mg,
    saturated_fat_g: product.saturated_fat_g,
    nutrislice_id: null,
    barcode: product.barcode,
    station_name: null,
    meal_period: null,
    served_date: null,
    dietary_tags: [],
    allergens: [],
  };
}
