import { supabase } from '@/lib/supabase';
export { defaultPreferences, fetchPreferences, savePreferences, usePreferences, useSavePreferences } from '@/lib/preferences';
export type { UserPreferences } from '@/lib/preferences';

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
