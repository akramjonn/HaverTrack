import { supabase } from "@/lib/supabase";
import type { MealLog, LogItem, WeightEntry } from "@/store/logStore";

/** How far back the app pulls history on launch. */
export const HISTORY_WINDOW_DAYS = 90;

interface MealLogRow {
  eaten_at?: string;
  nutrition_complete?: boolean;
  guided?: boolean;
  journey_id?: string;
  feedback_dismissed?: boolean;
  id: string;
  client_uuid: string;
  logged_date: string;
  meal_period: MealLog["meal_period"];
  title: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  photo_path: string | null;
  source: MealLog["source"];
  created_at: string;
  meal_log_items: {
    client_item_id?: string;
    menu_item_id?: string | null;
    nutrislice_id?: number;
    location_id?: string;
    station_name?: string;
    course?: import("./mealFlow").Course;
    nutrition_complete?: boolean;
    id: string;
    name: string;
    portion: number;
    portion_unit: string;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    is_estimate: boolean;
    confidence_score: number | null;
  }[];
}

function formatTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
}

function rowToMealLog(row: MealLogRow): MealLog {
  return {
    eaten_at: row.eaten_at,
    nutrition_complete: row.nutrition_complete,
    guided: row.guided,
    journey_id: row.journey_id,
    feedback_dismissed: row.feedback_dismissed,
    id: row.id,
    client_uuid: row.client_uuid,
    title: row.title,
    meal_period: row.meal_period,
    logged_date: row.logged_date,
    logged_time: formatTime(row.created_at),
    total_calories: row.total_calories,
    total_protein_g: Number(row.total_protein_g),
    total_carbs_g: Number(row.total_carbs_g),
    total_fat_g: Number(row.total_fat_g),
    source: row.source,
    photo_path: row.photo_path,
    synced: true,
    items: (row.meal_log_items ?? []).map((item) => ({
      client_item_id: item.client_item_id,
      menu_item_id: item.menu_item_id,
      nutrislice_id: item.nutrislice_id,
      location_id: item.location_id,
      station_name: item.station_name,
      course: item.course,
      nutrition_complete: item.nutrition_complete,
      id: item.id,
      name: item.name,
      portion: Number(item.portion),
      portion_unit: item.portion_unit,
      calories: item.calories ?? 0,
      protein_g: Number(item.protein_g ?? 0),
      carbs_g: Number(item.carbs_g ?? 0),
      fat_g: Number(item.fat_g ?? 0),
      is_estimate: item.is_estimate,
      confidence_score: item.confidence_score ?? undefined,
    })),
  };
}

export async function fetchMealLogs(userId: string): Promise<MealLog[]> {
  const since = new Date();
  since.setDate(since.getDate() - HISTORY_WINDOW_DAYS);

  const { data, error } = await supabase
    .from("meal_logs")
    .select("*, meal_log_items(*)")
    .eq("user_id", userId)
    .gte("logged_date", since.toISOString().slice(0, 10))
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as MealLogRow[]).map(rowToMealLog);
}

/**
 * Writes a meal and its items. `client_uuid` is unique per user, so replaying a
 * queued offline log cannot create a duplicate.
 */
export async function pushMealLog(
  userId: string,
  log: MealLog,
): Promise<MealLog> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || session.user.id !== userId)
    throw new Error(
      "Account changed. Your meal remains saved on its original device account.",
    );
  // The database derives ownership from the session, and saves all rows atomically.
  const { data, error } = await supabase
    .rpc("save_meal", {
      p: {
        ...log,
        items: log.items.map((item: LogItem) => ({
          ...item,
          client_item_id: item.client_item_id ?? item.id,
        })),
      },
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw new Error(error.message);
  return rowToMealLog(data as MealLogRow);
}

export async function deleteMealLogRemote(userId: string, clientUuid: string) {
  const { error } = await supabase
    .from("meal_logs")
    .delete()
    .eq("user_id", userId)
    .eq("client_uuid", clientUuid);

  if (error) throw new Error(error.message);
}

export async function fetchWeightEntries(
  userId: string,
): Promise<WeightEntry[]> {
  const { data, error } = await supabase
    .from("weight_entries")
    .select("*")
    .eq("user_id", userId)
    .order("recorded_on", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    recorded_on: row.recorded_on,
    weight_kg: Number(row.weight_kg),
  }));
}

export async function pushWeightEntry(userId: string, entry: WeightEntry) {
  const { data, error } = await supabase
    .from("weight_entries")
    .upsert(
      {
        user_id: userId,
        recorded_on: entry.recorded_on,
        weight_kg: entry.weight_kg,
      },
      { onConflict: "user_id,recorded_on" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    recorded_on: data.recorded_on,
    weight_kg: Number(data.weight_kg),
  };
}

/**
 * Uploads a captured meal photo. The path starts with the user id because that
 * first segment is what the storage policies check.
 */
export async function uploadMealPhoto(
  userId: string,
  base64: string,
): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("meal-photos")
    .upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) throw new Error(error.message);
  return path;
}

/** Meal photos live in a private bucket, so display needs a short-lived signed URL. */
export async function getMealPhotoUrl(path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from("meal-photos")
    .createSignedUrl(path, expiresInSeconds);

  if (error) return null;
  return data.signedUrl;
}
