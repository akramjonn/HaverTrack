import * as fs from 'fs';
import * as path from 'path';
import { calculateGoals } from '../src/lib/goals';
import { parseNutrisliceWeek } from '../src/lib/nutrislice';
import { generateInsights } from '../src/lib/insights';
import { MealLog } from '../src/store/logStore';

console.log('🐿️ Running SquirrelTrack Full Master Pipeline Test Suite...\n');

// 1. Goal Calculations
console.log('--- TEST 1: Goal Estimation & §11 Guardrails ---');
const standardGoal = calculateGoals({
  goal_type: 'maintain',
  weight_kg: 75,
  height_cm: 178,
  age: 20,
  sex: 'male',
  activity_level: 'moderate',
});
if (standardGoal.calorie_target! >= 1200) {
  console.log(`✅ Standard goal calculated: ${standardGoal.calorie_target} kcal`);
} else {
  throw new Error('Standard goal test failed');
}

const clampedGoal = calculateGoals({
  goal_type: 'lose',
  weight_kg: 40,
  height_cm: 150,
  age: 20,
  sex: 'female',
  activity_level: 'sedentary',
});
if (clampedGoal.calorie_target === 1200) {
  console.log(`✅ Hard floor clamped at exactly 1200 kcal floor: ${clampedGoal.calorie_target} kcal`);
} else {
  throw new Error(`Hard floor clamp failed: ${clampedGoal.calorie_target}`);
}

const trackingGoal = calculateGoals({ goal_type: 'tracking' });
if (trackingGoal.calorie_target === null) {
  console.log(`✅ Just tracking mode verified: null numeric limits`);
} else {
  throw new Error('Tracking goal test failed');
}

// 2. Nutrislice Fixtures
console.log('\n--- TEST 2: Nutrislice Parser & Fixture Validation ---');
const fixturesDir = path.join(__dirname, '../fixtures');
const meals: Array<{ file: string; type: 'breakfast' | 'lunch' | 'dinner' | 'brunch' }> = [
  { file: 'breakfast_week.json', type: 'breakfast' },
  { file: 'lunch_week.json', type: 'lunch' },
  { file: 'dinner_week.json', type: 'dinner' },
  { file: 'brunch_week.json', type: 'brunch' },
];

let totalItems = 0;
for (const m of meals) {
  const filePath = path.join(fixturesDir, m.file);
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const parsed = parseNutrisliceWeek(raw, m.type);
    totalItems += parsed.length;
    console.log(`✅ ${m.file}: Parsed ${parsed.length} items`);
  }
}
if (totalItems < 50) throw new Error('Nutrislice fixture test failed');

// 3. Rules Engine Insights
console.log('\n--- TEST 3: Deterministic Rules Engine Insights ---');
const testLogs: MealLog[] = [
  {
    id: '1',
    client_uuid: 'u1',
    title: 'Test Breakfast',
    meal_period: 'breakfast',
    logged_date: '2026-08-17',
    logged_time: '8:00am',
    total_calories: 400,
    total_protein_g: 30,
    total_carbs_g: 40,
    total_fat_g: 10,
    source: 'manual',
    items: [],
  },
  {
    id: '2',
    client_uuid: 'u2',
    title: 'Test Lunch',
    meal_period: 'lunch',
    logged_date: '2026-08-17',
    logged_time: '12:30pm',
    total_calories: 700,
    total_protein_g: 50,
    total_carbs_g: 60,
    total_fat_g: 20,
    source: 'manual',
    items: [],
  },
];

const insights = generateInsights(testLogs, {
  goal_type: 'maintain',
  calorie_target: 2300,
  protein_g: 140,
  carbs_g: 250,
  fat_g: 70,
});

console.log(`✅ Generated ${insights.length} dynamic insights for meal logs.`);

console.log('\n🎉 ALL PIPELINE TESTS PASSED WITH 100% SUCCESS!');
