import assert from "node:assert/strict";
import {
  discrepancies,
  parseCandidate,
  scaleMacros,
  servingGrams,
} from "../supabase/functions/_shared/nutrition";
import { matchesDiet } from "../src/lib/nutritionReview";
import { parseNutrisliceWeek } from "../src/lib/nutrislice";
assert.equal(servingGrams("1 cup"), null);
assert.equal(servingGrams("0 g"), null);
assert.equal(servingGrams("100 g"), 100);
assert.ok(Math.abs(servingGrams("4 oz")! - 113.398) < 0.001);
assert.equal(servingGrams("1 fl oz"), null);
assert.deepEqual(
  scaleMacros({ calories: 200, protein_g: null, carbs_g: 10, fat_g: 5 }, 150),
  { calories: 300, protein_g: null, carbs_g: 15, fat_g: 7.5 },
);
assert.ok(
  discrepancies({ calories: 50, protein_g: 50, carbs_g: 50, fat_g: 50 }).length,
);
assert.equal(
  discrepancies({ calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2 }).length,
  0,
);
assert.ok(
  discrepancies({
    calories: null,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  }).includes("Nutrition is incomplete"),
);
const candidate = parseCandidate({
  fdcId: 1,
  description: "Test",
  dataType: "Foundation",
  foodNutrients: [
    { nutrientId: 1008, unitName: "kJ", value: 500 },
    { nutrientId: 2048, unitName: "KCAL", value: 120 },
    { nutrientId: 1003, unitName: "G", value: 4 },
    { nutrientId: 1004, unitName: "G", value: -1 },
  ],
});
assert.equal(candidate.macros.calories, 120);
assert.equal(candidate.macros.fat_g, null);
assert.equal(candidate.macros.carbs_g, null);
assert.equal(
  matchesDiet({ dietary_tags: ["Wheat-Free"], protein_g: 5 }, "Gluten-Free"),
  false,
);
assert.equal(
  matchesDiet({ dietary_tags: ["Gluten Free"], protein_g: 5 }, "Gluten-Free"),
  true,
);
assert.equal(
  matchesDiet({ dietary_tags: ["Vegan"], protein_g: 5 }, "Halal"),
  false,
);
const parsed = parseNutrisliceWeek(
  {
    days: [
      {
        date: "2026-09-17",
        menu_items: [
          {
            id: 1,
            food: {
              id: 1,
              name: "Rice",
              icons: {
                food_icons: [
                  { id: 1, name: "Vegan" },
                  { id: 2, name: "Halal" },
                ],
              },
            },
          },
        ],
      },
    ],
  },
  "lunch",
);
assert.deepEqual(parsed[0].dietary_tags, ["Vegan", "Halal"]);
console.log(
  "PASS: portion normalization, missing nutrients, discrepancy thresholds, USDA units, and evidence-based dietary filters",
);
