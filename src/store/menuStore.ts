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
import { compareMenuOrder } from '@/lib/mealFlow';
import { indexBundledMenu } from '@/lib/menuDates';

interface MenuState {
  items: ParsedMenuItem[];
  syncedAt: string;
  isStale: boolean;
  isRefreshing: boolean;
  refreshError: string | null;

  /** Replaces the bundled fallback with every published menu date. */
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
    items: indexBundledMenu(latestMenuJson.items as ParsedMenuItem[]).map(item => ({ ...item, dietary_tags: item.dietary_tags.filter(tag => tag !== 'Wheat-Free') })),
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
        const data: ParsedMenuItem[] = [];
        // A week can exceed PostgREST's row limit. Load all pages so later dates aren't silently lost.
        for (let offset = 0; ; offset += 500) {
          const page = await supabase.from('reviewed_menu_items').select('*')
            .order('served_date').order('id').range(offset, offset + 499);
          if (page.error) throw page.error;
          data.push(...(page.data as ParsedMenuItem[]));
          if (page.data.length < 500) break;
        }

        const { data: categories, error: categoryError } = await supabase.from('dish_categories').select('location_id,nutrislice_id,course');
        if (categoryError) throw categoryError;
        const items = data.map(item => ({ ...item,
          course: categories?.find(c => c.location_id === item.location_id && c.nutrislice_id === item.nutrislice_id)?.course,
        })).sort((a,b) => a.served_date.localeCompare(b.served_date) || a.meal_period.localeCompare(b.meal_period) || compareMenuOrder(a,b));
        const liveSyncedAt = items.reduce(
          (latest, item) => (item.synced_at > latest ? item.synced_at : latest),
          items[0]?.synced_at ?? new Date().toISOString()
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
