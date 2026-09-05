import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/store/authStore";
import {
  fetchMealLogs,
  fetchWeightEntries,
  pushMealLog,
  pushWeightEntry,
  deleteMealLogRemote,
} from "@/lib/mealLogs";
import { loggingStreak } from "@/lib/stats";

export interface LogItem {
  id: string;
  client_item_id?: string;
  menu_item_id?: string | null;
  nutrislice_id?: number;
  location_id?: string;
  station_name?: string;
  course?: import("@/lib/mealFlow").Course;
  nutrition_complete?: boolean;
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
  eaten_at?: string;
  guided?: boolean;
  journey_id?: string;
  nutrition_complete?: boolean;
  feedback_dismissed?: boolean;
  title: string;
  meal_period: "breakfast" | "lunch" | "dinner" | "snack";
  logged_date: string; // YYYY-MM-DD
  logged_time: string; // e.g. "8:15am"
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  source: "manual" | "scan" | "menu";
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

const LOGS_KEY = "@havertrack_logs";
const WEIGHTS_KEY = "@havertrack_weights";
const DELETED_KEY = "@havertrack_pending_deletes";

// Pre-rename keys. Kept around (read-only, never written to again) so that
// devices with existing local-only data self-migrate on the next hydrate()
// instead of silently losing unsynced meal logs/pending deletes.
const LEGACY_LOGS_KEY = "@squirreltrack_logs";
const LEGACY_WEIGHTS_KEY = "@squirreltrack_weights";
const LEGACY_DELETED_KEY = "@squirreltrack_pending_deletes";

interface LogState {
  logs: MealLog[];
  weightEntries: WeightEntry[];
  isLoaded: boolean;
  isSyncing: boolean;
  syncError: string | null;
  /** client_uuids deleted locally that still need to be deleted on the server. */
  pendingDeletes: string[];
  /**
   * Set for one tick when `addMealLog` pushes the logging streak's `current`
   * count higher than it was before that log — e.g. the first log of a new
   * day. Transient: whatever reads it (the Today screen) is expected to
   * clear it right away via `clearStreakFlag` so the celebration can't refire.
   */
  justCrossedStreak: boolean;

  hydrate: (userId: string | null) => Promise<void>;
  syncPending: (userId: string) => Promise<void>;
  addMealLog: (
    meal: Omit<MealLog, "id" | "client_uuid">,
    userId?: string | null,
  ) => Promise<MealLog>;
  clearStreakFlag: () => void;
  updateMealLog: (
    id: string,
    meal: Partial<MealLog>,
    userId?: string | null,
  ) => Promise<void>;
  deleteMealLog: (id: string, userId?: string | null) => Promise<void>;
  addWeightEntry: (
    weight_kg: number,
    recorded_on?: string,
    userId?: string | null,
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

function scopedKey(key: string, userId: string | null) {
  return `${key}:${userId ?? "signed-out"}`;
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getTodayString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function cacheLogs(logs: MealLog[], userId: string | null) {
  try {
    await AsyncStorage.setItem(
      scopedKey(LOGS_KEY, userId),
      JSON.stringify(logs),
    );
  } catch (e) {
    console.warn("Local log cache write failed:", e);
  }
}

async function cacheWeights(entries: WeightEntry[], userId: string | null) {
  try {
    await AsyncStorage.setItem(
      scopedKey(WEIGHTS_KEY, userId),
      JSON.stringify(entries),
    );
  } catch (e) {
    console.warn("Local weight cache write failed:", e);
  }
}

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  weightEntries: [],
  isLoaded: false,
  isSyncing: false,
  syncError: null,
  pendingDeletes: [],
  justCrossedStreak: false,

  /**
   * Shows the cached copy immediately, then reconciles with the server. Anything
   * written while offline is replayed before the refresh so it is not overwritten.
   */
  hydrate: async (userId) => {
    set({ logs: [], weightEntries: [], pendingDeletes: [], isLoaded: false });
    if (!userId) {
      set({ isLoaded: true });
      return;
    }
    try {
      let [cachedLogs, cachedWeights, cachedDeletes] = await Promise.all([
        AsyncStorage.getItem(scopedKey(LOGS_KEY, userId)),
        AsyncStorage.getItem(scopedKey(WEIGHTS_KEY, userId)),
        AsyncStorage.getItem(scopedKey(DELETED_KEY, userId)),
      ]);

      // Self-migrate from the pre-rename keys the first time this runs on a
      // device that still only has local data under the old names.
      if (!cachedLogs) {
        const legacyLogs = await AsyncStorage.getItem(
          scopedKey(LEGACY_LOGS_KEY, userId),
        );
        if (legacyLogs) {
          cachedLogs = legacyLogs;
          await AsyncStorage.setItem(scopedKey(LOGS_KEY, userId), legacyLogs);
        }
      }
      if (!cachedWeights) {
        const legacyWeights = await AsyncStorage.getItem(
          scopedKey(LEGACY_WEIGHTS_KEY, userId),
        );
        if (legacyWeights) {
          cachedWeights = legacyWeights;
          await AsyncStorage.setItem(
            scopedKey(WEIGHTS_KEY, userId),
            legacyWeights,
          );
        }
      }
      if (!cachedDeletes) {
        const legacyDeletes = await AsyncStorage.getItem(
          scopedKey(LEGACY_DELETED_KEY, userId),
        );
        if (legacyDeletes) {
          cachedDeletes = legacyDeletes;
          await AsyncStorage.setItem(
            scopedKey(DELETED_KEY, userId),
            legacyDeletes,
          );
        }
      }

      if (currentUserId() !== userId) return;
      if (cachedLogs) set({ logs: JSON.parse(cachedLogs) });
      if (cachedWeights) set({ weightEntries: JSON.parse(cachedWeights) });
      if (cachedDeletes) set({ pendingDeletes: JSON.parse(cachedDeletes) });
    } catch (e) {
      console.warn("Failed to read local cache:", e);
    }

    if (currentUserId() !== userId) return;
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

      if (currentUserId() !== userId) return;
      const pending = get().logs.filter((log) => log.synced === false);
      const pendingIds = new Set(pending.map((log) => log.client_uuid));
      const reconciled = [
        ...pending,
        ...logs.filter((log) => !pendingIds.has(log.client_uuid)),
      ];
      set({ logs: reconciled, weightEntries: weights });
      await Promise.all([
        cacheLogs(reconciled, userId),
        cacheWeights(weights, userId),
      ]);
    } catch (e: any) {
      // Offline is a normal state on campus; the cached copy stays usable.
      if (currentUserId() === userId)
        set({ syncError: e?.message ?? "Could not reach HaverTrack." });
    } finally {
      if (currentUserId() === userId) set({ isSyncing: false, isLoaded: true });
    }
  },

  syncPending: async (userId) => {
    if (currentUserId() !== userId) return;
    const unsynced = get().logs.filter((log) => log.synced === false);
    const deletes = get().pendingDeletes;

    for (const clientUuid of deletes) {
      if (currentUserId() !== userId) return;
      try {
        await deleteMealLogRemote(userId, clientUuid);
        if (currentUserId() !== userId) return;
        const remaining = get().pendingDeletes.filter(
          (id) => id !== clientUuid,
        );
        set({ pendingDeletes: remaining });
        await AsyncStorage.setItem(
          scopedKey(DELETED_KEY, userId),
          JSON.stringify(remaining),
        );
      } catch (e) {
        console.warn("Deferred delete still failing:", e);
      }
    }

    for (const log of unsynced) {
      if (currentUserId() !== userId) return;
      try {
        const saved = await pushMealLog(userId, log);
        if (currentUserId() !== userId) return;
        set({
          logs: get().logs.map((l) =>
            l.client_uuid === log.client_uuid ? saved : l,
          ),
        });
      } catch (e) {
        console.warn("Deferred meal sync still failing:", e);
      }
    }

    if (currentUserId() === userId) await cacheLogs(get().logs, userId);
  },

  addMealLog: async (mealData, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const client_uuid = generateUUID();
    const newLog: MealLog = {
      ...mealData,
      items: mealData.items.map((item) => ({
        ...item,
        client_item_id: item.client_item_id ?? item.id,
      })),
      id: `local-${client_uuid}`,
      client_uuid,
      synced: false,
    };

    // Side-effect only — computed before the mutation for comparison against
    // the post-mutation streak below. Does not affect the log write itself.
    const streakBefore = loggingStreak(get().logs).current;

    // Optimistic: the meal appears the moment it is logged, then reconciles.
    const optimistic = [newLog, ...get().logs];
    set({ logs: optimistic });
    await cacheLogs(optimistic, userId);
    if (currentUserId() !== userId) return newLog;

    const streakAfter = loggingStreak(optimistic).current;
    if (streakAfter > streakBefore) {
      set({ justCrossedStreak: true });
    }

    if (!userId) return newLog;

    try {
      const saved = await pushMealLog(userId, newLog);
      if (currentUserId() !== userId) return saved;
      const reconciled = get().logs.map((l) =>
        l.client_uuid === client_uuid ? saved : l,
      );
      set({ logs: reconciled });
      await cacheLogs(reconciled, userId);
      return saved;
    } catch (e: any) {
      if (currentUserId() === userId)
        set({ syncError: e?.message ?? "Meal saved on this device only." });
    }
    return newLog;
  },

  updateMealLog: async (id, mealData, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const updated = get().logs.map((log) =>
      log.id === id ? { ...log, ...mealData, synced: false } : log,
    );
    set({ logs: updated });
    await cacheLogs(updated, userId);
    if (currentUserId() !== userId) return;

    const target = updated.find((log) => log.id === id);
    if (!userId || !target) return;

    try {
      const saved = await pushMealLog(userId, target);
      if (currentUserId() !== userId) return;
      const reconciled = get().logs.map((l) =>
        l.client_uuid === saved.client_uuid ? saved : l,
      );
      set({ logs: reconciled });
      await cacheLogs(reconciled, userId);
    } catch (e: any) {
      if (currentUserId() === userId)
        set({ syncError: e?.message ?? "Change saved on this device only." });
    }
  },

  deleteMealLog: async (id, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const target = get().logs.find((log) => log.id === id);
    const remaining = get().logs.filter((log) => log.id !== id);

    set({ logs: remaining });
    await cacheLogs(remaining, userId);
    if (currentUserId() !== userId) return;

    if (!target) return;

    if (!userId || target.synced === false) return;

    try {
      await deleteMealLogRemote(userId, target.client_uuid);
    } catch {
      if (currentUserId() !== userId) return;
      // Retried on next hydrate rather than resurrecting the meal in the UI.
      const queued = [...get().pendingDeletes, target.client_uuid];
      set({ pendingDeletes: queued });
      await AsyncStorage.setItem(
        scopedKey(DELETED_KEY, userId),
        JSON.stringify(queued),
      );
    }
  },

  addWeightEntry: async (weight_kg, recorded_on, explicitUserId) => {
    const userId = currentUserId(explicitUserId);
    const dateStr = recorded_on || getTodayString();
    const existing = get().weightEntries.find((w) => w.recorded_on === dateStr);

    const updated = existing
      ? get().weightEntries.map((w) =>
          w.recorded_on === dateStr ? { ...w, weight_kg } : w,
        )
      : [
          ...get().weightEntries,
          { id: `local-${dateStr}`, recorded_on: dateStr, weight_kg },
        ].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));

    set({ weightEntries: updated });
    await cacheWeights(updated, userId);
    if (currentUserId() !== userId) return;

    if (!userId) return;

    try {
      const saved = await pushWeightEntry(userId, {
        id: "",
        recorded_on: dateStr,
        weight_kg,
      });
      if (currentUserId() !== userId) return;
      const reconciled = get().weightEntries.map((w) =>
        w.recorded_on === dateStr ? saved : w,
      );
      set({ weightEntries: reconciled });
      await cacheWeights(reconciled, userId);
    } catch (e: any) {
      if (currentUserId() === userId)
        set({ syncError: e?.message ?? "Weight saved on this device only." });
    }
  },

  getLogsForDate: (dateStr) =>
    get().logs.filter((log) => log.logged_date === dateStr),

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
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),

  clear: () =>
    set({ logs: [], weightEntries: [], pendingDeletes: [], isLoaded: false }),

  clearStreakFlag: () => set({ justCrossedStreak: false }),
}));
