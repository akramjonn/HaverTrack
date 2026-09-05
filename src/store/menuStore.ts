import { create } from 'zustand';
import latestMenuJson from '../data/menus/latest.json';
import { ParsedMenuItem } from '@/lib/nutrislice';
import { supabase } from '@/lib/supabase';
import {
  SavedMeal,
  SavedMealInput,
  deleteFavorite,
  fetchFavorites,
  pushFavorite,
  touchFavorite,
} from '@/lib/favorites';
import { useAuthStore } from '@/store/authStore';

interface MenuState {
  items: ParsedMenuItem[];
  syncedAt: string;
  isStale: boolean;
  isRefreshing: boolean;
  refreshError: string | null;

  /** Replaces the bundled fallback with today's live Supabase menu. */
  refreshMenu: () => Promise<void>;

  /**
   * Saved meals, straight from public.user_favorites. This used to be an
   * in-memory map that evaporated on reload — every write now goes to the
   * database first and the local copy follows it.
   */
  favorites: SavedMeal[];
  favoritesLoaded: boolean;
  favoritesError: string | null;

  hydrateFavorites: (userId: string | null) => Promise<void>;
  /** Saves the dish if it is not saved, removes it if it is. */
  toggleFavorite: (input: SavedMealInput) => Promise<void>;
  saveFavorite: (input: SavedMealInput) => Promise<void>;
  removeFavorite: (dishName: string) => Promise<void>;
  markFavoriteLogged: (dishName: string) => Promise<void>;
  isFavorite: (dishName: string) => boolean;
  clearFavorites: () => void;

  getItemsForPeriod: (
    period: 'breakfast' | 'lunch' | 'dinner' | 'brunch' | 'coop',
    dateStr?: string
  ) => Record<string, ParsedMenuItem[]>;
}

/** Turns a menu row into the shape user_favorites stores. */
export function favoriteFromMenuItem(
  item: Pick<
    ParsedMenuItem,
    'dish_name' | 'nutrislice_id' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'serving_size' | 'station_name'
  >
): SavedMealInput {
  return {
    dish_name: item.dish_name,
    nutrislice_id: item.nutrislice_id,
    calories: item.calories,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
    serving_size: item.serving_size,
    station_name: item.station_name,
    source: 'menu',
  };
}

export const useMenuStore = create<MenuState>((set, get) => {
  const syncedAt = latestMenuJson.synced_at || new Date().toISOString();
  const syncTime = new Date(syncedAt).getTime();
  const now = Date.now();
  const hoursOld = (now - syncTime) / (1000 * 60 * 60);

  const currentUserId = () => useAuthStore.getState().user?.id ?? null;

  return {
    items: latestMenuJson.items as ParsedMenuItem[],
    syncedAt: syncedAt,
    isStale: hoursOld > 26,
    isRefreshing: false,
    refreshError: null,

    refreshMenu: async () => {
      // menu_items is intentionally authenticated-only under RLS. The tab group
      // calls this after auth restoration; signed-out screens keep the bundle.
      if (!currentUserId() || get().isRefreshing) return;

      set({ isRefreshing: true, refreshError: null });

      try {
        const dateParts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date());
        const datePart = (type: string) =>
          dateParts.find((part) => part.type === type)?.value ?? '';
        const today = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;

        const { data, error } = await supabase
          .from('menu_items')
          .select(
            'id, nutrislice_id, location_id, meal_period, served_date, station_name, station_id, dish_name, description, ingredients, serving_size, calories, protein_g, carbs_g, fat_g, dietary_tags, allergens, synced_at, availability'
          )
          .eq('served_date', today)
          .order('meal_period')
          .order('station_name')
          .order('dish_name');

        if (error) throw error;
        if (!data?.length) throw new Error(`No live menu rows were found for ${today}.`);

        const { data: categories, error: categoryError } = await supabase.from('dish_categories').select('location_id,nutrislice_id,course');
        if (categoryError) throw categoryError;
        const items = (data as ParsedMenuItem[]).map(item => ({ ...item,
          course: categories?.find(c => c.location_id === item.location_id && c.nutrislice_id === item.nutrislice_id)?.course,
        }));
        const liveSyncedAt = items.reduce(
          (latest, item) => (item.synced_at > latest ? item.synced_at : latest),
          items[0].synced_at
        );

        set({
          items,
          syncedAt: liveSyncedAt,
          isStale: Date.now() - new Date(liveSyncedAt).getTime() > 26 * 60 * 60 * 1000,
          isRefreshing: false,
          refreshError: null,
        });
      } catch (e: any) {
        // The checked-in snapshot remains usable offline; make the fallback
        // visible instead of blanking the menu when the network is unavailable.
        set({
          isRefreshing: false,
          refreshError: e?.message ?? 'The live menu could not be refreshed.',
        });
      }
    },

    favorites: [],
    favoritesLoaded: false,
    favoritesError: null,

    hydrateFavorites: async (userId) => {
      if (!userId) {
        set({ favorites: [], favoritesLoaded: true, favoritesError: null });
        return;
      }

      try {
        const favorites = await fetchFavorites(userId);
        set({ favorites, favoritesLoaded: true, favoritesError: null });
      } catch (e: any) {
        set({
          favoritesLoaded: true,
          favoritesError: `Could not load your saved meals: ${e?.message ?? 'unknown error'}`,
        });
      }
    },

    toggleFavorite: async (input) => {
      if (get().isFavorite(input.dish_name)) {
        await get().removeFavorite(input.dish_name);
      } else {
        await get().saveFavorite(input);
      }
    },

    saveFavorite: async (input) => {
      const userId = currentUserId();
      if (!userId) {
        set({ favoritesError: 'Sign in to save meals — there is nowhere to keep them yet.' });
        return;
      }

      set({ favoritesError: null });
      try {
        const saved = await pushFavorite(userId, input);
        const rest = get().favorites.filter((f) => f.dish_name !== saved.dish_name);
        set({ favorites: [saved, ...rest] });
      } catch (e: any) {
        set({ favoritesError: `Could not save "${input.dish_name}": ${e?.message ?? 'unknown error'}` });
      }
    },

    removeFavorite: async (dishName) => {
      const userId = currentUserId();
      if (!userId) return;

      const previous = get().favorites;
      set({ favorites: previous.filter((f) => f.dish_name !== dishName), favoritesError: null });

      try {
        await deleteFavorite(userId, dishName);
      } catch (e: any) {
        // Put it back rather than pretend it was removed.
        set({
          favorites: previous,
          favoritesError: `Could not remove "${dishName}": ${e?.message ?? 'unknown error'}`,
        });
      }
    },

    markFavoriteLogged: async (dishName) => {
      const userId = currentUserId();
      if (!userId || !get().isFavorite(dishName)) return;

      const stamp = new Date().toISOString();
      set({
        favorites: get().favorites.map((f) =>
          f.dish_name === dishName ? { ...f, last_logged_at: stamp } : f
        ),
      });

      try {
        await touchFavorite(userId, dishName);
      } catch {
        // A missing "last logged" timestamp is cosmetic; the meal log itself is
        // already saved by the caller, so this is not worth an error banner.
      }
    },

    isFavorite: (dishName) => get().favorites.some((f) => f.dish_name === dishName),

    clearFavorites: () => set({ favorites: [], favoritesLoaded: false, favoritesError: null }),

    getItemsForPeriod: (period, dateStr) => {
      const items = get().items;
      // Filter by period and date
      const matched = items.filter((item) => {
        const periodMatch =
          period === 'coop'
            ? item.station_name.toLowerCase().includes('coop') || item.station_name.toLowerCase().includes('grill')
            : item.meal_period === period;

        if (dateStr) {
          return periodMatch && item.served_date === dateStr;
        }
        return periodMatch;
      });

      // Group by station
      const grouped: Record<string, ParsedMenuItem[]> = {};
      for (const item of matched) {
        const station = item.station_name || 'Main Line';
        if (!grouped[station]) grouped[station] = [];
        grouped[station].push(item);
      }

      return grouped;
    },
  };
});
