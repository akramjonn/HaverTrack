import assert from "node:assert/strict";
import {
  classifyDish,
  servingKey,
  isRating,
  csvCell,
  compareMenuOrder,
  menuSections,
} from "../src/lib/mealFlow";
import { menuDays, shiftMenuDay } from '../src/lib/menuDates';
import { parseNutrisliceWeek } from '../src/lib/nutrislice';
import { featuredMeals } from '../src/lib/featuredMeal';
import type { ParsedMenuItem } from "../src/lib/nutrislice";
const dish = (name: string, course?: ParsedMenuItem["course"]) =>
  classifyDish({ dish_name: name, station_name: "Main line", course });
assert.notEqual(dish("Grilled chicken").course, "main");
assert.equal(dish("Steamed rice").course, "side");
assert.equal(dish("Chocolate cake").course, "dessert");
assert.equal(dish("Apple juice").course, "drink");
assert.equal(dish("Mystery special").course, "other");
assert.equal(dish("Chicken soup", "appetizer").course, "appetizer");
assert.notEqual(dish("Steamed rice", "main").course, 'main');
assert.ok([1, 2, 3, 4, 5].every(isRating));
assert.ok([0, 6, 2.5, NaN, Infinity].every((n) => !isRating(n)));
assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
assert.equal(csvCell('a"b'), '"a""b"');
const base = {
  location_id: "dc",
  served_date: "2026-09-04",
  meal_period: "dinner",
  station_id: 1,
  nutrislice_id: 22,
} as ParsedMenuItem;
assert.notEqual(servingKey(base), servingKey({ ...base, station_id: 2 }));
assert.notEqual(
  servingKey(base),
  servingKey({ ...base, served_date: "2026-09-05" }),
);
console.log(
  "PASS: classification, staff overrides, serving identity, star bounds, safe CSV",
);
const foods = parseNutrisliceWeek({ days: [{ date: '2026-09-17', menu_items: [
  { id: 1, is_station_header: true, text: 'The Main Line', station_id: 1 },
  { id: 2, food: { id: 20, name: 'Corned Beef Griller' } },
  { id: 3, food: { id: 21, name: 'Apple chicken' } },
  { id: 4, is_station_header: true, text: 'Salad Bar', station_id: 2 },
  { id: 5, food: { id: 22, name: 'Mystery salad' } },
] }, { date: '2026-09-18', menu_items: [
  { id: 6, is_station_header: true, text: 'Main Line', station_id: 1 },
  { id: 7, food: { id: 23, name: 'Seasonal special' } },
] }] }, 'lunch');
assert.deepEqual(foods.map(i => i.source_order), [0,1,0,0]);
assert.equal(classifyDish(foods[3]).course, 'main');
assert.notEqual(classifyDish(foods[1]).course, 'main');
assert.notEqual(classifyDish({ ...foods[0], station_name: 'The Grill', course: 'main' }).course, 'main');
assert.deepEqual(menuSections(foods.slice(0,3)).map(s => [s.name, s.foods.map(i => i.dish_name)]), [['The Main Line', ['Corned Beef Griller', 'Apple chicken']], ['Salad Bar', ['Mystery salad']]]);
assert.notEqual(classifyDish(foods[2]).course, 'main');
assert.equal(classifyDish({ ...foods[0], course: 'side' }).course, 'main');
assert.equal([...foods.slice(0,3)].reverse().sort(compareMenuOrder)[0].dish_name, 'Corned Beef Griller');
assert.equal(featuredMeals(foods, new Date('2026-09-17T16:00:00Z'))[0].dish_name, 'Corned Beef Griller');
assert.equal(shiftMenuDay('2026-03-08', 1), '2026-03-09');
assert.equal(shiftMenuDay('2026-12-31', 1), '2027-01-01');
const dates = menuDays(foods, '2026-09-17', '2026-10-01');
assert.ok(dates.includes('2026-09-18') && dates.includes('2026-09-23') && dates.includes('2026-10-01'));
assert.equal(new Set(dates).size, dates.length);
console.log('PASS: original station order, Main Line priority, featured main, published/unposted date choices, DST and year boundaries');
