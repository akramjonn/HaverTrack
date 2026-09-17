import assert from 'node:assert/strict';
import { campusDate, featuredMeals, featuredLogItem, mealHeadline } from '../src/lib/featuredMeal';
import type { ParsedMenuItem } from '../src/lib/nutrislice';
const now = new Date('2026-09-17T16:00:00Z');
const base: ParsedMenuItem = {
  nutrislice_id: 1, location_id: 'dining-location', meal_period: 'lunch',
  served_date: '2026-09-17', station_name: 'The Main Line', station_id: 1, source_order: 0,
  dish_name: 'Salmon sushi', description: null, ingredients: null, serving_size: '6 pieces',
  calories: 300, protein_g: 20, carbs_g: 40, fat_g: 10,
  dietary_tags: [], allergens: ['Fish'], synced_at: now.toISOString(),
};
assert.equal(campusDate(new Date('2026-09-18T02:00:00Z')), '2026-09-17');
const dinner = { ...base, nutrislice_id: 2, dish_name: 'Grilled chicken', meal_period: 'dinner' as const };
const menu = [dinner, base, { ...base, station_id: 2 },
  { ...base, dish_name: 'Old pasta', served_date: '2026-09-16' },
  { ...base, dish_name: 'Unavailable pizza', availability: 'unavailable' as const },
  { ...base, dish_name: 'Unknown tacos', availability: 'unknown' as const },
  { ...base, dish_name: 'Other chicken', location_id: 'other' },
  { ...base, dish_name: 'Soy sauce', source_order: 1, course: 'condiment' as const },
  { ...base, dish_name: 'Sushi rice', source_order: 2, course: 'side' as const },
  { ...base, dish_name: 'Grill special', station_name: 'The Grill', course: 'main' as const }];
assert.deepEqual(featuredMeals(menu, now).map(i => i.dish_name), ['Salmon sushi', 'Grilled chicken']);
assert.equal(featuredMeals(menu, new Date('2026-09-17T22:00:00Z'))[0].dish_name, 'Grilled chicken');
assert.equal(featuredMeals(menu, new Date('2026-09-18T16:00:00Z')).length, 0);
assert.equal(featuredMeals([{ ...base, meal_period: 'brunch' }, dinner], now)[0].meal_period, 'brunch');
const logged = featuredLogItem({ ...base, protein_g: null }, 1.5);
assert.equal(logged.calories, 450);
assert.equal(logged.nutrition_complete, false);
assert.equal(logged.nutrislice_id, base.nutrislice_id);
assert.equal(logged.location_id, base.location_id);
assert.equal(featuredLogItem(base, 0.5).protein_g, 10);
assert.throws(() => featuredLogItem(base, NaN));
assert.throws(() => featuredLogItem(base, 0));
assert.throws(() => featuredLogItem(base, 11));
assert.match(mealHeadline(base.dish_name), /roll/);
console.log('PASS: campus dates, current service, stale/unavailable exclusions, deduplication, portions and partial nutrition');
