import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { compactNumber, fullDate, relativeTime } from '@/lib/format';

// Re-exported so existing `@/lib/admin` call sites keep working unchanged —
// these three are plain date/number formatting with no admin-specific
// dependency, now owned by `@/lib/format`.
export { compactNumber, fullDate, relativeTime };

/**
 * Client for the admin analytics RPCs (migration 20260819010000_admin.sql).
 *
 * Every function here is a `security definer` RPC that calls `admin_require()`
 * first, so a non-admin caller gets a 42501 rather than a partial result. That
 * means the UI never has to decide what an admin may see — the database already
 * did, and the readable surface is exactly the columns these types describe.
 *
 * Deliberately absent: meal photos, and any per-day weight or per-day calorie
 * history for a named student. See the header of the migration.
 */

/** Selectable trend window, in days. */
export type TrendWindow = 7 | 30 | 90;

export const TREND_WINDOWS: { value: `${TrendWindow}`; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

// ---------------------------------------------------------------------------
// Row types — one per RPC, mirroring the SQL `returns table (...)` exactly.
// Postgres bigint arrives over PostgREST as a JS number for these magnitudes.
// ---------------------------------------------------------------------------

export interface AdminOverview {
  total_users: number;
  college_verified_users: number;
  onboarded_users: number;
  new_users_7d: number;
  new_users_30d: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  total_meals: number;
  meals_today: number;
  meals_7d: number;
  meals_per_active_user_7d: number;
  avg_calories_7d: number;
  scan_share_30d: number;
  menu_last_sync: string | null;
  menu_null_calorie_pct: number;
  audit_events_7d: number;
}

export type FunnelStepKey =
  | 'signed_up'
  | 'email_verified'
  | 'onboarded'
  | 'first_meal'
  | 'habit';

export interface AdminFunnelStep {
  step_order: number;
  step_key: FunnelStepKey;
  step_label: string;
  user_count: number;
  pct_of_signups: number;
}

export interface AdminTrendPoint {
  day: string; // YYYY-MM-DD
  new_signups: number;
  dau: number;
  wau: number;
  meals_logged: number;
  scan_meals: number;
  menu_meals: number;
  manual_meals: number;
  avg_calories_per_active_user: number;
}

export interface AdminRosterRow {
  user_id: string;
  full_name: string | null;
  email: string;
  joined_at: string;
  college_verified: boolean;
  class_year: number | null;
  onboarded_at: string | null;
  last_active_at: string | null;
  email_confirmed_at: string | null;
  total_meals: number;
  days_logged: number;
  meals_7d: number;
  avg_calories_7d: number;
  avg_calories_30d: number;
  current_streak: number;
  scans_today: number;
  weight_entry_count: number;
  goal_type: string | null;
  calorie_target: number | null;
  last_logged_date: string | null;
}

export interface AdminUserDetail {
  user_id: string;
  full_name: string | null;
  email: string;
  joined_at: string;
  email_confirmed_at: string | null;
  college_verified: boolean;
  college_email: string | null;
  class_year: number | null;
  units: string | null;
  role: string;
  onboarded_at: string | null;
  last_active_at: string | null;
  goal_type: string | null;
  calorie_target: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  total_meals: number;
  days_logged: number;
  meals_7d: number;
  meals_30d: number;
  avg_calories_7d: number;
  avg_calories_30d: number;
  current_streak: number;
  first_logged_date: string | null;
  last_logged_date: string | null;
  scan_meals: number;
  menu_meals: number;
  manual_meals: number;
  weight_entry_count: number;
  favorite_count: number;
}

export interface AdminUserActivityPoint {
  day: string;
  meals: number;
  scan_meals: number;
}

export interface AdminContentSummary {
  last_sync: string | null;
  hours_since_sync: number | null;
  total_items: number;
  null_calorie_items: number;
  null_calorie_pct: number;
  earliest_date: string | null;
  latest_date: string | null;
  days_covered: number;
  days_ahead: number;
  items_today: number;
}

export interface AdminContentDay {
  served_date: string;
  meal_period: string;
  item_count: number;
  null_calorie_items: number;
  null_calorie_pct: number;
  last_synced: string | null;
}

export interface AdminTopDish {
  dish_name: string;
  log_count: number;
  user_count: number;
}

export interface AdminTopStation {
  station_name: string;
  log_count: number;
  user_count: number;
}

export interface AdminPeakHour {
  hour_of_day: number;
  log_count: number;
  user_count: number;
}

export interface AdminAuditEntry {
  id: string;
  created_at: string;
  action: string;
  admin_email: string | null;
  subject_user_id: string | null;
  subject_email: string | null;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/**
 * `supabase.rpc` is untyped here (no generated Database types in this project),
 * so this is the single place the `any` lives and the single place an RPC error
 * is turned into a throw that react-query can surface.
 */
async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn as never, (args ?? {}) as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function callRpcSingle<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  const rows = await callRpc<T>(fn, args);
  return rows[0] ?? null;
}

export const fetchOverview = () => callRpcSingle<AdminOverview>('admin_overview');
export const fetchFunnel = () => callRpc<AdminFunnelStep>('admin_funnel');
export const fetchTrend = (days: TrendWindow) =>
  callRpc<AdminTrendPoint>('admin_platform_trend', { p_days: days });
export const fetchRoster = (search: string, offset = 0) =>
  callRpc<AdminRosterRow>('admin_user_roster', { p_search: search || null, p_limit: 50, p_offset: offset });
/** Writes an `admin_audit_log` row every time it resolves. */
export const fetchUserDetail = (userId: string) =>
  callRpcSingle<AdminUserDetail>('admin_user_detail', { p_user_id: userId });
export const fetchUserActivity = (userId: string, days: number) =>
  callRpc<AdminUserActivityPoint>('admin_user_activity', { p_user_id: userId, p_days: days });
export const fetchContentSummary = () => callRpcSingle<AdminContentSummary>('admin_content_summary');
export const fetchContentDaily = (days: number) =>
  callRpc<AdminContentDay>('admin_content_daily', { p_days: days });
export const fetchTopDishes = (days: TrendWindow) =>
  callRpc<AdminTopDish>('admin_top_dishes', { p_days: days, p_limit: 8 });
export const fetchTopStations = (days: TrendWindow) =>
  callRpc<AdminTopStation>('admin_top_stations', { p_days: days, p_limit: 8 });
export const fetchPeakHours = (days: TrendWindow) =>
  callRpc<AdminPeakHour>('admin_peak_hours', { p_days: days });
export const fetchAuditRecent = (limit = 25) =>
  callRpc<AdminAuditEntry>('admin_audit_recent', { p_limit: limit });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Stats move slowly; a minute of staleness is cheaper than re-scanning the table. */
const STALE_MS = 60_000;

export const adminKeys = {
  all: ['admin'] as const,
  overview: () => ['admin', 'overview'] as const,
  funnel: () => ['admin', 'funnel'] as const,
  trend: (days: TrendWindow) => ['admin', 'trend', days] as const,
  roster: (search: string, offset = 0) => ['admin', 'roster', search, offset] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  userActivity: (id: string, days: number) => ['admin', 'user', id, 'activity', days] as const,
  contentSummary: () => ['admin', 'content', 'summary'] as const,
  contentDaily: (days: number) => ['admin', 'content', 'daily', days] as const,
  engagement: (days: TrendWindow) => ['admin', 'engagement', days] as const,
  audit: () => ['admin', 'audit'] as const,
};

export function useAdminOverview(enabled = true) {
  return useQuery({
    enabled,
    queryKey: adminKeys.overview(),
    queryFn: fetchOverview,
    staleTime: STALE_MS,
  });
}

export function useAdminFunnel() {
  return useQuery({
    queryKey: adminKeys.funnel(),
    queryFn: fetchFunnel,
    staleTime: STALE_MS,
  });
}

export function useAdminTrend(days: TrendWindow) {
  return useQuery({
    queryKey: adminKeys.trend(days),
    queryFn: () => fetchTrend(days),
    staleTime: STALE_MS,
  });
}

export function useAdminRoster(search: string, offset = 0) {
  return useQuery({
    queryKey: adminKeys.roster(search, offset),
    queryFn: () => fetchRoster(search, offset),
    staleTime: STALE_MS,
    placeholderData: (previous) => previous,
  });
}

/**
 * Audited: resolving this writes an `admin_audit_log` row naming the admin and
 * the student. `staleTime: 0` and no retry keep the log honest — one row per
 * deliberate open, not per re-render, and not multiplied by retries.
 */
export function useAdminUserDetail(userId: string) {
  return useQuery({
    queryKey: adminKeys.user(userId),
    queryFn: () => fetchUserDetail(userId),
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}

export function useAdminUserActivity(userId: string, days = 30) {
  return useQuery({
    queryKey: adminKeys.userActivity(userId, days),
    queryFn: () => fetchUserActivity(userId, days),
    enabled: !!userId,
    staleTime: STALE_MS,
  });
}

export function useAdminContentSummary() {
  return useQuery({
    queryKey: adminKeys.contentSummary(),
    queryFn: fetchContentSummary,
    staleTime: STALE_MS,
  });
}

export function useAdminContentDaily(days = 14) {
  return useQuery({
    queryKey: adminKeys.contentDaily(days),
    queryFn: () => fetchContentDaily(days),
    staleTime: STALE_MS,
  });
}

export function useAdminEngagement(days: TrendWindow) {
  return useQuery({
    queryKey: adminKeys.engagement(days),
    queryFn: async () => {
      const [dishes, stations, hours] = await Promise.all([
        fetchTopDishes(days),
        fetchTopStations(days),
        fetchPeakHours(days),
      ]);
      return { dishes, stations, hours };
    },
    staleTime: STALE_MS,
  });
}

export function useAdminAudit(limit = 15) {
  return useQuery({
    queryKey: adminKeys.audit(),
    queryFn: () => fetchAuditRecent(limit),
    staleTime: STALE_MS,
  });
}

// ---------------------------------------------------------------------------
// Formatting & severity helpers
// ---------------------------------------------------------------------------

/** "3 Aug" style short date from a YYYY-MM-DD or ISO string. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** 13 → "1 PM". Used for the peak-hours axis. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

export type Severity = 'good' | 'warning' | 'critical' | 'neutral';

/**
 * Severity for the Nutrislice sync age. A stale sync means students are reading
 * yesterday's menu, so this escalates in hours, not days.
 */
export function syncSeverity(hoursSinceSync: number | null | undefined): Severity {
  if (hoursSinceSync == null) return 'critical';
  if (hoursSinceSync <= 24) return 'good';
  if (hoursSinceSync <= 48) return 'warning';
  return 'critical';
}

/**
 * Severity for the share of dishes with no calorie figure. Every NULL here is a
 * dish a student can pick and a scan cannot price, so the bar is low.
 */
export function nullCaloriesSeverity(pct: number | null | undefined): Severity {
  if (pct == null) return 'neutral';
  if (pct < 5) return 'good';
  if (pct < 15) return 'warning';
  return 'critical';
}

/** Percentage of `part` in `whole`, guarding the empty-platform divide-by-zero. */
export function share(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}
