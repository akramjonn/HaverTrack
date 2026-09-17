import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { operationalErrorCode, trackOperationalEvent } from '@/lib/observability';

const PAGE_SIZE = 500;

type ExportTable =
  | 'daily_goals'
  | 'weight_entries'
  | 'water_entries'
  | 'user_favorites'
  | 'meal_logs'
  | 'meal_ratings'
  | 'notification_preferences';

async function fetchAllForUser(table: ExportTable, userId: string) {
  const rows: unknown[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
    offset += PAGE_SIZE;
  }
}

async function fetchMealDetails(userId: string) {
  const meals: unknown[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('meal_logs')
      .select('*, meal_log_items(*), meal_log_nutrients(*)')
      .eq('user_id', userId)
      .order('logged_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    meals.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return meals;
    offset += PAGE_SIZE;
  }
}

/** Builds a complete, user-readable export without including auth tokens or credentials. */
export async function buildAccountExport(userId: string) {
  const [profileResult, preferencesResult, goals, weights, water, favorites, meals, ratings, notifications] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
      fetchAllForUser('daily_goals', userId),
      fetchAllForUser('weight_entries', userId),
      fetchAllForUser('water_entries', userId),
      fetchAllForUser('user_favorites', userId),
      fetchMealDetails(userId),
      fetchAllForUser('meal_ratings', userId),
      fetchAllForUser('notification_preferences', userId),
    ]);

  if (profileResult.error) throw profileResult.error;
  if (preferencesResult.error) throw preferencesResult.error;

  return {
    format: 'havertrack-account-export/v1',
    exported_at: new Date().toISOString(),
    data: {
      profile: profileResult.data,
      preferences: preferencesResult.data,
      daily_goals: goals,
      weight_entries: weights,
      water_entries: water,
      user_favorites: favorites,
      meal_logs: meals,
      meal_ratings: ratings,
      notification_preferences: notifications,
    },
    photo_note:
      'Meal photo paths are included with each meal. Image files are not embedded in this JSON download.',
  };
}

export async function downloadAccountExport(userId: string) {
  trackOperationalEvent('account_export_started');
  try {
    const contents = JSON.stringify(await buildAccountExport(userId), null, 2);
    const filename = `havertrack-data-${new Date().toISOString().slice(0, 10)}.json`;

    if (Platform.OS === 'web') {
      const blob = new Blob([contents], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const file = new File(Paths.cache, filename);
      file.create({ intermediates: true, overwrite: true });
      file.write(contents);

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device.');
      }
      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Save HaverTrack data export',
        mimeType: 'application/json',
        UTI: 'public.json',
      });
    }
    trackOperationalEvent('account_export_completed');
  } catch (error) {
    trackOperationalEvent('account_export_failed', { code: operationalErrorCode(error) });
    throw error;
  }
}
