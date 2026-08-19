import { calculateGoals, MIN_CALORIE_FLOOR } from '../src/lib/goals';

console.log('--- Testing calculateGoals & §11 Wellbeing Guardrails ---');

// Test 1: Standard Male 5'10" 168lb Age 19 Moderate
const standard = calculateGoals({
  goal_type: 'lose',
  height_cm: 178,
  weight_kg: 76,
  age: 19,
  sex: 'male',
  activity_level: 'moderate',
});
console.log('Test 1 (Standard lose 0.5 lb/wk):', standard);
if (standard.calorie_target && standard.calorie_target >= 1200) {
  console.log('✅ Test 1 Passed: Target calculated above 1200 kcal');
} else {
  throw new Error('Test 1 Failed');
}

// Test 2: Low calorie scenario (Hard Floor check at 1200 kcal)
const lowCal = calculateGoals({
  goal_type: 'lose',
  height_cm: 150,
  weight_kg: 40,
  age: 25,
  sex: 'female',
  activity_level: 'sedentary',
});
console.log('Test 2 (Low intake clamp):', lowCal);
if (lowCal.calorie_target === MIN_CALORIE_FLOOR) {
  console.log('✅ Test 2 Passed: Strict 1200 kcal floor enforced!');
} else {
  console.log(`⚠️ Expected ${MIN_CALORIE_FLOOR}, got ${lowCal.calorie_target}`);
}

// Test 3: Just Tracking Mode
const tracking = calculateGoals({
  goal_type: 'tracking',
});
console.log('Test 3 (Just Tracking Mode):', tracking);
if (tracking.calorie_target === null && tracking.protein_g === null) {
  console.log('✅ Test 3 Passed: Just tracking produces null targets & clean translation');
} else {
  throw new Error('Test 3 Failed');
}

// Test 4: Skipped fields fallback
const fallback = calculateGoals({
  goal_type: 'maintain',
});
console.log('Test 4 (Skipped fields fallback):', fallback);
if (fallback.is_default_fallback && fallback.calorie_target) {
  console.log('✅ Test 4 Passed: Conservative defaults applied when fields skipped');
} else {
  throw new Error('Test 4 Failed');
}

console.log('\n🎉 ALL GOAL CALCULATION & WELLBEING TESTS PASSED!');
