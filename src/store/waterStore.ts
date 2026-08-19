import { create } from 'zustand';
import { useAuthStore } from '@/store/authStore';
import { getTodayString } from '@/store/logStore';
import {
  DEFAULT_WATER_TARGET_ML,
  WaterEntry,
  deleteWaterEntry,
  fetchPreferences,
  fetchWaterEntries,
  pushWaterEntry,
  savePreferences,
} from '@/lib/water';

interface WaterState {
  /** Entries for `loadedDate` only — water is a today-shaped feature. */
  entries: WaterEntry[];
  loadedDate: string | null;
  targetMl: number;
  isLoading: boolean;
  /** Surfaced verbatim in the UI; never swallowed. */
  error: string | null;

  hydrate: (userId: string | null, dateStr?: string) => Promise<void>;
  addWater: (ml: number) => Promise<void>;
  undoLast: () => Promise<void>;
  setTarget: (ml: number) => Promise<void>;
  totalMl: () => number;
  clear: () => void;
}

export const useWaterStore = create<WaterState>((set, get) => ({
  entries: [],
  loadedDate: null,
  targetMl: DEFAULT_WATER_TARGET_ML,
  isLoading: false,
  error: null,

  hydrate: async (userId, dateStr) => {
    const date = dateStr ?? getTodayString();

    if (!userId) {
      set({ entries: [], loadedDate: date, error: null });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const [entries, prefs] = await Promise.all([
        fetchWaterEntries(userId, date),
        fetchPreferences(userId),
      ]);
      set({
        entries,
        loadedDate: date,
        targetMl: prefs?.water_target_ml ?? DEFAULT_WATER_TARGET_ML,
      });
    } catch (e: any) {
      set({ error: `Could not load your water log: ${e?.message ?? 'unknown error'}` });
    } finally {
      set({ isLoading: false });
    }
  },

  addWater: async (ml) => {
    const userId = useAuthStore.getState().user?.id ?? null;
    const date = get().loadedDate ?? getTodayString();

    if (!userId) {
      set({ error: 'Sign in to track water — there is nowhere to save it yet.' });
      return;
    }

    set({ error: null });
    try {
      const saved = await pushWaterEntry(userId, date, ml);
      set({ entries: [...get().entries, saved], loadedDate: date });
    } catch (e: any) {
      set({ error: `Could not save that glass: ${e?.message ?? 'unknown error'}` });
    }
  },

  undoLast: async () => {
    const userId = useAuthStore.getState().user?.id ?? null;
    const entries = get().entries;
    const last = entries[entries.length - 1];
    if (!last || !userId) return;

    set({ error: null });
    try {
      await deleteWaterEntry(userId, last.id);
      set({ entries: entries.slice(0, -1) });
    } catch (e: any) {
      set({ error: `Could not undo that: ${e?.message ?? 'unknown error'}` });
    }
  },

  setTarget: async (ml) => {
    const userId = useAuthStore.getState().user?.id ?? null;
    if (!userId) return;

    const previous = get().targetMl;
    set({ targetMl: ml, error: null });
    try {
      await savePreferences(userId, { water_target_ml: ml });
    } catch (e: any) {
      set({ targetMl: previous, error: `Could not save your water target: ${e?.message ?? 'unknown error'}` });
    }
  },

  totalMl: () => get().entries.reduce((sum, entry) => sum + entry.ml, 0),

  clear: () => set({ entries: [], loadedDate: null, error: null }),
}));
