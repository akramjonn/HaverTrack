import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/authStore';
import {
  fetchMealLogs,
  fetchWeightEntries,
  pushMealLog,
  pushWeightEntry,
  deleteMealLogRemote,
} from '@/lib/mealLogs';

export interface LogItem {
  id: string;
  name: string;
  portion: number;
  portion_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_estimate?: boolean;
  confidence_score?: number;
}

export interface MealLog {
  id: string;
  client_uuid: string;
  title: string;
  meal_period: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  logged_date: string; // YYYY-MM-DD
  logged_time: string; // e.g. "8:15am"
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  source: 'manual' | 'scan' | 'menu';
  photo_path?: string | null;
  /** False while the row exists only on this device. */
  synced?: boolean;
  items: LogItem[];
}

export interface WeightEntry {
  id: string;
  recorded_on: string; // YYYY-MM-DD
  weight_kg: number;
}

const LOGS_KEY = '@squirreltrack_logs';
const WEIGHTS_KEY = '@squirreltrack_weights';
const DELETED_KEY = '@squirreltrack_pending_deletes';

interface LogState {
  logs: MealLog[];
  weightEntries: WeightEntry[];
  isLoaded: boolean;
  isSyncing: boolean;
  syncError: string | null;
  /** client_uuids deleted locally that still need to be deleted on the server. */
  pendingDeletes: string[];

  hydrate: (userId: string | null) => Promise<void>;
  syncPending: (userId: string) => Promise<void>;
  addMealLog: (meal: Omit<MealLog, 'id' | 'client_uuid'>, userId?: string | null) => Promise<void>;
  updateMealLog: (id: string, meal: Partial<MealLog>, userId?: string | null) => Promise<void>;
  deleteMealLog: (id: string, userId?: string | null) => Promise<void>;
  addWeightEntry: (
    weight_kg: number,
    recorded_on?: string,
    userId?: string | null
  ) => Promise<void>;
  getLogsForDate: (dateStr: string) => MealLog[];
  getTotalsForDate: (dateStr: string) => {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  clear: () => void;
}

/** Falls back to the signed-in user so no call site can forget to sync. */
function currentUserId(explicit?: string | null) {
  if (explicit !== undefined) return explicit;
  return useAuthStore.getState().user?.id ?? null;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getTodayString() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function cacheLogs(logs: MealLog[]) {
  try {
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn('Local log cache write failed:', e);
  }
}

async function cacheWeights(entries: WeightEntry[]) {
  try {
    await AsyncStorage.setItem(WEIGHTS_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('Local weight cache write failed:', e);
  }
}

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  weightEntries: [],
  isLoaded: false,
  isSyncing: false,
  syncError: null,
  pendingDeletes: [],

  /**
   * Shows the cached copy immediately, then reconciles with the server. Anything
   * written while offline is replayed before the refresh so it is not overwritten.
   */
  hydrate: async (userId) => {
    try {
      const [cachedLogs, cachedWeights, cachedDeletes] = await Promise.all([
        AsyncStorage.getItem(LOGS_KEY),
        AsyncStorage.getItem(WEIGHTS_KEY),
        AsyncStorage.getItem(DELETED_KEY),
      ]);

      if (cachedLogs) set({ logs: JSON.parse(cachedLogs) });
      if (cachedWeights) set({ weightEntries: JSON.parse(cachedWeights) });
      if (cachedDeletes) set({ pendingDeletes: JSON.parse(cachedDeletes) });
    } catch (e) {
      console.warn('Failed to read local cache:', e);
    }

    if (!userId) {
      set({ isLoaded: true });
      return;
    }

    set({ isSyncing: true, syncError: null });
    try {
      await get().syncPending(userId);

      const [logs, weights] = await Promise.all([
        fetchMealLogs(userId),
        fetchWeightEntries(userId),
      ]);

      set({ logs, weightEntries: weights });
      await Promise.all([cacheLogs(logs), cacheWeights(weights)]);
    } catch (e: any) {
      // Offline is a normal state on campus; the cached copy stays usable.
      set({ syncError: e?.message ?? 'Could not reach SquirrelTrack.' });
    } finally {
      set({ isSyncing: false, isLoaded: true });
    }
  },

  syncPending: async (userId) => {
    const unsynced = get().logs.filter((log) => log.synced === false);
    const deletes = get().pendingDeletes;

    for (const clientUuid of deletes) {
      try {
        await deleteMealLogRemote(userId, clientUuid);
        const remaining = get().pendingDeletes.filter((id) => id !== clientUuid);
        set({ pendingDeletes: remaining });
        await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(remaining));
      } catch (e) {
        console.warn('Deferred delete still failing:', e);
      }
    }

    for (const log of unsynced) {
      try {
        const saved = await pushMealLog(userId, log);
        set({
          logs: get().logs.map((l) => (l.client_uuid === log.client_uuid ? saved : l)),
        });
      } catch (e) {
        console.warn('Deferred meal sync still failing:', e);
      }
    }

    await cacheLogs(get().logs);
  },

  addMealLog: async (mealData, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const client_uuid = generateUUID();
    const newLog: MealLog = {
      ...mealData,
      id: `local-${client_uuid}`,
      client_uuid,
      synced: false,
    };

    // Optimistic: the meal appears the moment it is logged, then reconciles.
    const optimistic = [newLog, ...get().logs];
    set({ logs: optimistic });
    await cacheLogs(optimistic);

    if (!userId) return;

    try {
      const saved = await pushMealLog(userId, newLog);
      const reconciled = get().logs.map((l) => (l.client_uuid === client_uuid ? saved : l));
      set({ logs: reconciled });
      await cacheLogs(reconciled);
    } catch (e: any) {
      set({ syncError: e?.message ?? 'Meal saved on this device only.' });
    }
  },

  updateMealLog: async (id, mealData, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const updated = get().logs.map((log) =>
      log.id === id ? { ...log, ...mealData, synced: false } : log
    );
    set({ logs: updated });
    await cacheLogs(updated);

    const target = updated.find((log) => log.id === id);
    if (!userId || !target) return;

    try {
      const saved = await pushMealLog(userId, target);
      const reconciled = get().logs.map((l) => (l.client_uuid === saved.client_uuid ? saved : l));
      set({ logs: reconciled });
      await cacheLogs(reconciled);
    } catch (e: any) {
      set({ syncError: e?.message ?? 'Change saved on this device only.' });
    }
  },

  deleteMealLog: async (id, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const target = get().logs.find((log) => log.id === id);
    const remaining = get().logs.filter((log) => log.id !== id);

    set({ logs: remaining });
    await cacheLogs(remaining);

    if (!target) return;

    if (!userId || target.synced === false) return;

    try {
      await deleteMealLogRemote(userId, target.client_uuid);
    } catch {
      // Retried on next hydrate rather than resurrecting the meal in the UI.
      const queued = [...get().pendingDeletes, target.client_uuid];
      set({ pendingDeletes: queued });
      await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(queued));
    }
  },

  addWeightEntry: async (weight_kg, recorded_on, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const dateStr = recorded_on || getTodayString();
    const existing = get().weightEntries.find((w) => w.recorded_on === dateStr);

    const updated = existing
      ? get().weightEntries.map((w) => (w.recorded_on === dateStr ? { ...w, weight_kg } : w))
      : [...get().weightEntries, { id: `local-${dateStr}`, recorded_on: dateStr, weight_kg }].sort(
          (a, b) => a.recorded_on.localeCompare(b.recorded_on)
        );

    set({ weightEntries: updated });
    await cacheWeights(updated);

    if (!userId) return;

    try {
      const saved = await pushWeightEntry(userId, {
        id: '',
        recorded_on: dateStr,
        weight_kg,
      });
      const reconciled = get().weightEntries.map((w) =>
        w.recorded_on === dateStr ? saved : w
      );
      set({ weightEntries: reconciled });
      await cacheWeights(reconciled);
    } catch (e: any) {
      set({ syncError: e?.message ?? 'Weight saved on this device only.' });
    }
  },

  getLogsForDate: (dateStr) => get().logs.filter((log) => log.logged_date === dateStr),

  getTotalsForDate: (dateStr) =>
    get()
      .logs.filter((log) => log.logged_date === dateStr)
      .reduce(
        (acc, log) => ({
          calories: acc.calories + log.total_calories,
          protein: acc.protein + log.total_protein_g,
          carbs: acc.carbs + log.total_carbs_g,
          fat: acc.fat + log.total_fat_g,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),

  clear: () => set({ logs: [], weightEntries: [], pendingDeletes: [], isLoaded: false }),
}));
