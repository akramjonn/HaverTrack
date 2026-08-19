import { supabase } from '@/lib/supabase';

export interface WaterEntry {
  id: string;
  logged_date: string; // YYYY-MM-DD
  ml: number;
  created_at: string;
}

export const DEFAULT_WATER_TARGET_ML = 2500;
/** One US cup, the unit the tiles are built around. */
export const CUP_ML = 240;

export async function fetchWaterEntries(userId: string, loggedDate: string): Promise<WaterEntry[]> {
  const { data, error } = await supabase
    .from('water_entries')
    .select('id, logged_date, ml, created_at')
    .eq('user_id', userId)
    .eq('logged_date', loggedDate)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    logged_date: row.logged_date,
    ml: Number(row.ml),
    created_at: row.created_at,
  }));
}

export async function pushWaterEntry(
  userId: string,
  loggedDate: string,
  ml: number
): Promise<WaterEntry> {
  const { data, error } = await supabase
    .from('water_entries')
    .insert({ user_id: userId, logged_date: loggedDate, ml })
    .select('id, logged_date, ml, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { id: data.id, logged_date: data.logged_date, ml: Number(data.ml), created_at: data.created_at };
}

export async function deleteWaterEntry(userId: string, id: string) {
  const { error } = await supabase
    .from('water_entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export interface UserPreferences {
  water_target_ml: number;
  goal_weight_kg: number | null;
}

export async function fetchPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('water_target_ml, goal_weight_kg')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    water_target_ml: Number(data.water_target_ml),
    goal_weight_kg: data.goal_weight_kg === null ? null : Number(data.goal_weight_kg),
  };
}

export async function savePreferences(
  userId: string,
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select('water_target_ml, goal_weight_kg')
    .single();

  if (error) throw new Error(error.message);
  return {
    water_target_ml: Number(data.water_target_ml),
    goal_weight_kg: data.goal_weight_kg === null ? null : Number(data.goal_weight_kg),
  };
}
