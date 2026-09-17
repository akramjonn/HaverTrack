import type { ParsedMenuItem } from './nutrislice';
import { campusPeriod, isMainLineFirst, compareMenuOrder, servingKey } from './mealFlow';
import type { LoggableItem } from './logging';

export function campusDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Only today's published DC mains; never advertise an old offline snapshot as today's food. */
export function featuredMeals(items: ParsedMenuItem[], now = new Date()) {
  const period = campusPeriod(now);
  const day = campusDate(now);
  const seen = new Set<string>();
  return items.filter(item => item.served_date === day && item.location_id === 'dining-location'
    && item.availability !== 'unavailable' && item.availability !== 'unknown'
    && isMainLineFirst(item))
    .sort((a, b) => Number(b.meal_period === period || (period === 'lunch' && b.meal_period === 'brunch'))
      - Number(a.meal_period === period || (period === 'lunch' && a.meal_period === 'brunch'))
      || compareMenuOrder(a, b))
    .filter(item => { const key = item.dish_name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 3);
}

export function mealHeadline(name: string) {
  if (/\b(sushi|maki)\b/i.test(name)) return 'Let the good\ntimes roll.';
  if (/\b(pizza|flatbread)\b/i.test(name)) return 'A slice of\nsomething good.';
  if (/\b(taco|tacos|burrito)\b/i.test(name)) return 'Wrap up\nyour cravings.';
  if (/\b(pasta|spaghetti|lasagna)\b/i.test(name)) return 'A little twirl.\nA lovely meal.';
  return 'Good food.\nRight here.';
}

export function featuredLogItem(item: ParsedMenuItem, portion: number): LoggableItem {
  if (!Number.isFinite(portion) || portion <= 0 || portion > 10) throw new Error('Choose between 0.25 and 10 servings.');
  return {
    id: servingKey(item), menu_item_id: item.id, nutrislice_id: item.nutrislice_id,
    location_id: item.location_id, station_name: item.station_name, course: 'main',
    name: item.dish_name, portion, portion_unit: 'serving',
    calories: (item.calories ?? 0) * portion, protein_g: (item.protein_g ?? 0) * portion,
    carbs_g: (item.carbs_g ?? 0) * portion, fat_g: (item.fat_g ?? 0) * portion,
    nutrition_complete: [item.calories, item.protein_g, item.carbs_g, item.fat_g].every(n => n != null),
  };
}
