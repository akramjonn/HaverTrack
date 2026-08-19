import { supabase } from '@/lib/supabase';

export type FavoriteSource = 'menu' | 'manual' | 'scan' | 'barcode';

export interface SavedMeal {
  id: string;
  dish_name: string;
  nutrislice_id: number | null;
  /** Null means the nutrition was never known, not that it is zero. */
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_size: string | null;
  station_name: string | null;
  source: FavoriteSource;
  last_logged_at: string | null;
  created_at: string;
}

export type SavedMealInput = Omit<SavedMeal, 'id' | 'created_at' | 'last_logged_at'>;

function rowToSavedMeal(row: any): SavedMeal {
  return {
    id: row.id,
    dish_name: row.dish_name,
    nutrislice_id: row.nutrislice_id ?? null,
    calories: row.calories ?? null,
    protein_g: row.protein_g === null || row.protein_g === undefined ? null : Number(row.protein_g),
    carbs_g: row.carbs_g === null || row.carbs_g === undefined ? null : Number(row.carbs_g),
    fat_g: row.fat_g === null || row.fat_g === undefined ? null : Number(row.fat_g),
    serving_size: row.serving_size ?? null,
    station_name: row.station_name ?? null,
    source: (row.source ?? 'menu') as FavoriteSource,
    last_logged_at: row.last_logged_at ?? null,
    created_at: row.created_at,
  };
}

const COLUMNS =
  'id, dish_name, nutrislice_id, calories, protein_g, carbs_g, fat_g, serving_size, station_name, source, last_logged_at, created_at';

export async function fetchFavorites(userId: string): Promise<SavedMeal[]> {
  const { data, error } = await supabase
    .from('user_favorites')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSavedMeal);
}

/** Unique on (user_id, dish_name), so saving the same dish twice just refreshes it. */
export async function pushFavorite(userId: string, input: SavedMealInput): Promise<SavedMeal> {
  const { data, error } = await supabase
    .from('user_favorites')
    .upsert(
      {
        user_id: userId,
        dish_name: input.dish_name,
        nutrislice_id: input.nutrislice_id,
        calories: input.calories,
        protein_g: input.protein_g,
        carbs_g: input.carbs_g,
        fat_g: input.fat_g,
        serving_size: input.serving_size,
        station_name: input.station_name,
        source: input.source,
      },
      { onConflict: 'user_id,dish_name' }
    )
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return rowToSavedMeal(data);
}

export async function deleteFavorite(userId: string, dishName: string) {
  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('dish_name', dishName);

  if (error) throw new Error(error.message);
}

export async function touchFavorite(userId: string, dishName: string) {
  const { error } = await supabase
    .from('user_favorites')
    .update({ last_logged_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('dish_name', dishName);

  if (error) throw new Error(error.message);
}
