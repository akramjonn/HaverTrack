import assert from "node:assert/strict";
import {
  classifyDish,
  servingKey,
  isRating,
  csvCell,
} from "../src/lib/mealFlow";
import type { ParsedMenuItem } from "../src/lib/nutrislice";
const dish = (name: string, course?: ParsedMenuItem["course"]) =>
  classifyDish({ dish_name: name, station_name: "Main line", course });
assert.equal(dish("Grilled chicken").course, "main");
assert.equal(dish("Steamed rice").course, "side");
assert.equal(dish("Chocolate cake").course, "dessert");
assert.equal(dish("Apple juice").course, "drink");
assert.equal(dish("Mystery special").course, "other");
assert.equal(dish("Chicken soup", "appetizer").course, "appetizer");
assert.equal(dish("Steamed rice", "main").needsReview, false);
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
