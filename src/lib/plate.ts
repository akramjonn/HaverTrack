import type { ParsedMenuItem } from '@/lib/nutrislice';

/**
 * Build-a-plate.
 *
 * Cal AI can only ever describe a photo of food that already exists. We hold the
 * Dining Center menu as structured data, so we can answer the question a student
 * actually has at 5:45pm: *given what is on the line tonight and what I have
 * left, what should I put on the tray?*
 *
 * It is a bounded 0/1 knapsack — maximise protein without exceeding the calorie
 * budget, at most `maxItems` dishes, one serving of each. Exact rather than
 * greedy, because the menu is small enough (tens of dishes) that exactness is
 * free and a greedy answer would visibly pick worse plates.
 */

export interface PlateCandidate {
  nutrislice_id: number;
  dish_name: string;
  station_name: string;
  serving_size: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  dietary_tags: string[];
  allergens: string[];
}

export interface PlateSuggestion {
  items: PlateCandidate[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface PlateConstraints {
  /** Calories still available today. Plates never exceed it. */
  calorieBudget: number;
  /** Protein still owed today. Used as the objective, not as a hard limit. */
  proteinGap: number;
  maxItems?: number;
  /** Dish must carry every tag listed (e.g. ['Vegan']). */
  requiredTags?: string[];
  /** Dish is dropped if it carries any of these allergens. */
  excludedAllergens?: string[];
}

const BUCKET_KCAL = 10;

/** Menu rows the solver can actually use: real calories, real serving. */
export function toCandidates(items: ParsedMenuItem[]): PlateCandidate[] {
  const bestByName = new Map<string, PlateCandidate>();

  for (const item of items) {
    if (item.calories === null || item.calories <= 0) continue;
    // A single dish over 1200 kcal is a tray-bake row in Nutrislice, not a
    // serving a student takes; including it produces nonsense plates.
    if (item.calories > 1200) continue;

    const candidate: PlateCandidate = {
      nutrislice_id: item.nutrislice_id,
      dish_name: item.dish_name,
      station_name: item.station_name,
      serving_size: item.serving_size,
      calories: Math.round(item.calories),
      protein_g: item.protein_g ?? 0,
      carbs_g: item.carbs_g ?? 0,
      fat_g: item.fat_g ?? 0,
      dietary_tags: item.dietary_tags ?? [],
      allergens: item.allergens ?? [],
    };

    // The same dish can appear on more than one line; keep one of each.
    if (!bestByName.has(candidate.dish_name)) bestByName.set(candidate.dish_name, candidate);
  }

  return [...bestByName.values()];
}

export function filterCandidates(
  candidates: PlateCandidate[],
  constraints: Pick<PlateConstraints, 'requiredTags' | 'excludedAllergens'>
): PlateCandidate[] {
  const required = constraints.requiredTags ?? [];
  const excluded = constraints.excludedAllergens ?? [];

  return candidates.filter((c) => {
    if (required.some((tag) => !c.dietary_tags.includes(tag))) return false;
    if (excluded.some((allergen) => c.allergens.includes(allergen))) return false;
    return true;
  });
}

/**
 * Returns the best plate, or null when nothing fits the budget at all.
 * `maxItems` is small on purpose — a tray holds a few dishes, not a buffet.
 */
export function buildPlate(
  candidates: PlateCandidate[],
  constraints: PlateConstraints
): PlateSuggestion | null {
  const maxItems = Math.max(1, constraints.maxItems ?? 3);
  const budget = Math.floor(constraints.calorieBudget);
  if (budget <= 0) return null;

  const usable = filterCandidates(candidates, constraints).filter((c) => c.calories <= budget);
  if (!usable.length) return null;

  const buckets = Math.floor(budget / BUCKET_KCAL);

  // dp[k][c] = best protein using exactly ≤k items within c calorie buckets.
  // `pick` remembers which item closed each cell so the plate can be rebuilt.
  const NEG = -1;
  const dp: number[][] = Array.from({ length: maxItems + 1 }, () =>
    new Array<number>(buckets + 1).fill(0)
  );
  const pick: Int32Array[] = Array.from({ length: maxItems + 1 }, () => {
    const row = new Int32Array(buckets + 1);
    row.fill(NEG);
    return row;
  });
  const from: Int32Array[] = Array.from({ length: maxItems + 1 }, () => new Int32Array(buckets + 1));

  for (let index = 0; index < usable.length; index += 1) {
    const item = usable[index];
    const cost = Math.max(1, Math.ceil(item.calories / BUCKET_KCAL));
    if (cost > buckets) continue;

    // Iterate k downwards so each dish is used at most once.
    for (let k = maxItems; k >= 1; k -= 1) {
      for (let c = buckets; c >= cost; c -= 1) {
        const candidateProtein = dp[k - 1][c - cost] + item.protein_g;
        if (candidateProtein > dp[k][c] + 1e-9) {
          dp[k][c] = candidateProtein;
          pick[k][c] = index;
          from[k][c] = c - cost;
        }
      }
    }
  }

  // Best cell: most protein, then the fewest calories that achieve it.
  let bestK = 0;
  let bestC = 0;
  let bestProtein = -1;
  for (let k = 1; k <= maxItems; k += 1) {
    for (let c = 0; c <= buckets; c += 1) {
      const protein = dp[k][c];
      if (protein > bestProtein + 1e-9) {
        bestProtein = protein;
        bestK = k;
        bestC = c;
      }
    }
  }

  if (bestProtein <= 0 || bestK === 0) {
    // No protein anywhere in the filtered menu — fall back to the single dish
    // that uses the budget best, so the screen still says something true.
    const fallback = [...usable].sort((a, b) => b.calories - a.calories)[0];
    if (!fallback) return null;
    return summarise([fallback]);
  }

  const chosen: PlateCandidate[] = [];
  let k = bestK;
  let c = bestC;
  while (k > 0 && pick[k][c] !== NEG) {
    const index = pick[k][c];
    chosen.push(usable[index]);
    const previous = from[k][c];
    c = previous;
    k -= 1;
  }

  return summarise(chosen.reverse());
}

function summarise(items: PlateCandidate[]): PlateSuggestion {
  return {
    items,
    calories: items.reduce((sum, i) => sum + i.calories, 0),
    protein_g: Math.round(items.reduce((sum, i) => sum + i.protein_g, 0) * 10) / 10,
    carbs_g: Math.round(items.reduce((sum, i) => sum + i.carbs_g, 0) * 10) / 10,
    fat_g: Math.round(items.reduce((sum, i) => sum + i.fat_g, 0) * 10) / 10,
  };
}
