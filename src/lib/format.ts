/**
 * Plain date/number formatting helpers, shared across admin and self-service
 * screens. Originally lived in `src/lib/admin.ts`; extracted because none of
 * these have any admin-specific dependency — they're pure formatting.
 */

/** 1,284 → "1,284"; 12,900 → "12.9K". Keeps stat tiles from wrapping. */
export function compactNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (Math.abs(n) < 10_000) return n.toLocaleString();
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function fullDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "4h ago" / "3d ago". Returns "—" for nulls rather than inventing a zero. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
