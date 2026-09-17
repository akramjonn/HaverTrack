import type { ParsedMenuItem } from './nutrislice';

export function shiftMenuDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function menuDays(items: ParsedMenuItem[], today: string, selected: string) {
  return [...new Set([today, selected, ...Array.from({ length: 7 }, (_, i) => shiftMenuDay(today, i)), ...items.map(i => i.served_date)])].sort();
}
/** Only bundled source-order arrays may use this fallback; never infer order from alphabetized DB rows. */
export function indexBundledMenu(items: ParsedMenuItem[]): ParsedMenuItem[] {
  const positions = new Map<string, number>();
  return items.map(item => {
    const key = [item.location_id,item.served_date,item.meal_period,item.station_id ?? item.station_name].join('|');
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    return { ...item, source_order: item.source_order ?? position };
  });
}
