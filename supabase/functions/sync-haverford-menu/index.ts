import { createClient } from "npm:@supabase/supabase-js@2.112.3";

import { checkNutritionBatch } from '../_shared/usda.ts';
const API_BASE = "https://haverfordcollege.api.nutrislice.com/menu/api";
const LOCATION_ID = "dining-location";
const MEALS = ["breakfast", "lunch", "dinner", "brunch"] as const;
const RETRYABLE = new Set([403, 408, 425, 429]);

type Meal = (typeof MEALS)[number];
type JsonObject = Record<string, unknown>;

type MenuItem = {
  source_order: number;
  nutrislice_id: number;
  location_id: string;
  meal_period: Meal;
  served_date: string;
  station_name: string;
  station_id: number | null;
  dish_name: string;
  description: string | null;
  ingredients: string | null;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  dietary_tags: string[];
  allergens: string[];
  synced_at: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;

const stringOrNull = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const numberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function easternDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return { year: get("year")!, month: get("month")!, day: get("day")! };
}

async function fetchWithRetry(url: string, attempts = 4) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "HaverTrack-Menu-Sync/2.0",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok || (!RETRYABLE.has(response.status) && response.status < 500)) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(
          resolve,
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 20_000)
            : 1000 * 2 ** (attempt - 1),
        ));
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// This is the Edge-runtime port of src/lib/nutrislice.ts. It deliberately keeps
// the same database shape while validating the upstream boundary without adding
// an app-bundler dependency to the function.
function parseWeek(payload: unknown, meal: Meal) {
  const root = object(payload);
  if (!root || !Array.isArray(root.days)) throw new Error("Response has no days array");
  const rows: MenuItem[] = [];
  const scopes: { served_date: string; meal_period: Meal }[] = [];
  const syncedAt = new Date().toISOString();

  for (const rawDay of root.days) {
    const day = object(rawDay);
    const servedDate = day?.date;
    if (typeof servedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(servedDate)) {
      throw new Error(`Invalid menu date: ${String(servedDate)}`);
    }
    if (!Array.isArray(day.menu_items)) throw new Error(`${servedDate} has no menu_items array`);
    scopes.push({ served_date: servedDate, meal_period: meal });
    let stationName = "Main Station";
    let stationId: number | null = null;
    let sourceOrder = 0;

    for (const rawItem of day.menu_items) {
      const item = object(rawItem);
      if (!item) throw new Error(`${servedDate} contains an invalid menu item`);
      if (item.is_station_header === true) {
        stationName = stringOrNull(item.text) ?? stationName;
        stationId = numberOrNull(item.station_id);
        sourceOrder = 0;
        continue;
      }
      const food = object(item.food);
      if (!food) continue;
      if (typeof food.id !== "number" || !Number.isInteger(food.id)) {
        throw new Error(`${servedDate} contains a food without an integer id`);
      }
      const dishName = stringOrNull(food.name);
      if (!dishName) throw new Error(`${servedDate} contains food ${food.id} without a name`);

      const nutrition = object(food.rounded_nutrition_info);
      const serving = object(food.serving_size_info);
      const icons = object(food.icons);
      const foodIcons = Array.isArray(icons?.food_icons) ? icons.food_icons : [];
      const dietaryTags: string[] = [];
      const allergens: string[] = [];
      for (const rawIcon of foodIcons) {
        const icon = object(rawIcon);
        if (!icon || typeof icon.name !== "string") continue;
        if (icon.is_highlight === true || ["Vegan", "Vegetarian", "Halal", "Kosher", "Gluten-Free", "Gluten Free"].includes(icon.name)) {
          if (!dietaryTags.includes(icon.name)) dietaryTags.push(icon.name);
        }
        if ((icon.is_filter === true && !["Vegan", "Vegetarian", "Halal", "Kosher", "Gluten-Free", "Gluten Free"].includes(icon.name)) || ["Milk", "Egg", "Wheat", "Soy", "Peanuts", "Tree Nuts", "Sesame", "Fish"].includes(icon.name)) {
          if (!allergens.includes(icon.name)) allergens.push(icon.name);
        }
      }
      const amount = stringOrNull(serving?.serving_size_amount);
      const unit = stringOrNull(serving?.serving_size_unit);

      rows.push({
        source_order: sourceOrder++,
        nutrislice_id: food.id,
        location_id: LOCATION_ID,
        meal_period: meal,
        served_date: servedDate,
        station_name: stationName,
        station_id: stationId,
        dish_name: dishName,
        description: stringOrNull(food.description),
        ingredients: stringOrNull(food.ingredients),
        serving_size: amount && unit ? `${amount} ${unit}` : null,
        calories: numberOrNull(nutrition?.calories),
        protein_g: numberOrNull(nutrition?.g_protein),
        carbs_g: numberOrNull(nutrition?.g_carbs),
        fat_g: numberOrNull(nutrition?.g_fat),
        dietary_tags: dietaryTags,
        allergens,
        synced_at: syncedAt,
      });
    }
  }
  return { rows, scopes };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const dispatchSecret = Deno.env.get("MENU_SYNC_SECRET");
  if (!dispatchSecret || request.headers.get("x-menu-sync-secret") !== dispatchSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const database = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { year, month, day } = easternDateParts();
    const results = await Promise.all(MEALS.map(async (meal) => {
      const url = `${API_BASE}/weeks/school/${LOCATION_ID}/menu-type/${meal}/${year}/${month}/${day}/?format=json`;
      const response = await fetchWithRetry(url);
      if (!response.ok) throw new Error(`${meal}: Nutrislice returned HTTP ${response.status}`);
      try {
        return parseWeek(await response.json(), meal);
      } catch (error) {
        throw new Error(`${meal}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));

    const scopes = results.flatMap((result) => result.scopes);
    const deduped = new Map<string, MenuItem>();
    for (const item of results.flatMap((result) => result.rows)) {
      const key = `${item.nutrislice_id}|${item.meal_period}|${item.served_date}`;
      const existing = deduped.get(key);
      if (!existing || !(/\bmain\s*line\b/i.test(existing.station_name) && existing.source_order === 0)) deduped.set(key, item);
    }
    const items = [...deduped.values()];
    if (!items.length) throw new Error("All meal endpoints returned zero items; preserving last-known-good data");

    const { data, error } = await database.rpc("apply_haverford_menu_sync", {
      p_run_id: runId,
      p_started_at: startedAt,
      p_items: items,
      p_scopes: scopes,
    });
    if (error) throw error;
    console.log(JSON.stringify({ event: "menu_sync_succeeded", run_id: runId, ...data }));
    let nutrition;
    try { nutrition = await checkNutritionBatch(database); }
    catch { nutrition = { error: 'Nutrition checks failed; menu sync succeeded' }; }
    return json({ run_id: runId, ...data, nutrition });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "menu_sync_failed", run_id: runId, error: message }));
    const { error: loggingError } = await database.rpc("record_haverford_menu_sync_failure", {
      p_run_id: runId,
      p_started_at: startedAt,
      p_error: message,
    });
    if (loggingError) {
      console.error(JSON.stringify({
        event: "menu_sync_failure_log_failed",
        run_id: runId,
        error: loggingError.message,
      }));
    }
    return json({ run_id: runId, error: "Menu sync failed; existing menu data was preserved" }, 502);
  }
});
