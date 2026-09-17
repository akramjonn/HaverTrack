import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { operationalErrorCode, trackOperationalEvent } from '@/lib/observability';

export type WeightUnit = 'lb' | 'kg';
export type HeightUnit = 'ft_in' | 'cm';
export type ClockFormat = '12h' | '24h';
export type LegacyUnits = 'imperial' | 'metric';

export interface UserPreferences {
  water_target_ml: number;
  goal_weight_kg: number | null;
  rollover_calories: boolean;
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  clock_format: ClockFormat;
}

const PREFERENCES_COLUMNS =
  'water_target_ml, goal_weight_kg, rollover_calories, weight_unit, height_unit, clock_format';

function defaultsFor(legacyUnits: LegacyUnits = 'imperial'): UserPreferences {
  return {
    water_target_ml: 2500,
    goal_weight_kg: null,
    rollover_calories: false,
    weight_unit: legacyUnits === 'metric' ? 'kg' : 'lb',
    height_unit: legacyUnits === 'metric' ? 'cm' : 'ft_in',
    clock_format: '12h',
  };
}

function mapPreferencesRow(row: Record<string, unknown>, legacyUnits?: LegacyUnits): UserPreferences {
  const defaults = defaultsFor(legacyUnits);
  return {
    water_target_ml: Number(row.water_target_ml ?? defaults.water_target_ml),
    goal_weight_kg: row.goal_weight_kg === null || row.goal_weight_kg === undefined
      ? null
      : Number(row.goal_weight_kg),
    rollover_calories: Boolean(row.rollover_calories),
    weight_unit: row.weight_unit === 'kg' ? 'kg' : defaults.weight_unit,
    height_unit: row.height_unit === 'cm' ? 'cm' : defaults.height_unit,
    clock_format: row.clock_format === '24h' ? '24h' : '12h',
  };
}

export function defaultPreferences(legacyUnits: LegacyUnits = 'imperial'): UserPreferences {
  return defaultsFor(legacyUnits);
}

export function preferenceQueryKey(userId: string | null | undefined) {
  return ['user-preferences', userId] as const;
}

export async function fetchPreferences(
  userId: string,
  legacyUnits: LegacyUnits = 'imperial'
): Promise<UserPreferences> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select(PREFERENCES_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data ? mapPreferencesRow(data, legacyUnits) : defaultsFor(legacyUnits);
  } catch (error) {
    trackOperationalEvent('preferences_load_failed', { code: operationalErrorCode(error) });
    throw new Error(error instanceof Error ? error.message : 'Could not load preferences.');
  }
}

export async function savePreferences(
  userId: string,
  patch: Partial<UserPreferences>,
  legacyUnits: LegacyUnits = 'imperial'
): Promise<UserPreferences> {
  try {
    const current = await fetchPreferences(userId, legacyUnits);
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          ...current,
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select(PREFERENCES_COLUMNS)
      .single();

    if (error) throw error;
    trackOperationalEvent('preferences_save_completed', { fields: Object.keys(patch).length });
    return mapPreferencesRow(data, legacyUnits);
  } catch (error) {
    trackOperationalEvent('preferences_save_failed', { code: operationalErrorCode(error) });
    throw new Error(error instanceof Error ? error.message : 'Could not save preferences.');
  }
}

export function usePreferences(userId: string | null | undefined, legacyUnits: LegacyUnits = 'imperial') {
  return useQuery({
    queryKey: preferenceQueryKey(userId),
    queryFn: () => fetchPreferences(userId!, legacyUnits),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useSavePreferences(userId: string | null | undefined, legacyUnits: LegacyUnits = 'imperial') {
  const queryClient = useQueryClient();
  const key = preferenceQueryKey(userId);

  return useMutation({
    mutationFn: (patch: Partial<UserPreferences>) => {
      if (!userId) throw new Error('You need to be signed in to save preferences.');
      return savePreferences(userId, patch, legacyUnits);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserPreferences>(key);
      queryClient.setQueryData<UserPreferences>(key, (current) => ({
        ...(current ?? defaultsFor(legacyUnits)),
        ...patch,
      }));
      return { previous };
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
