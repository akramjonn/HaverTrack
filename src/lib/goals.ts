import { z } from 'zod';

export const GoalCalculationInputSchema = z.object({
  goal_type: z.enum(['lose', 'maintain', 'gain', 'tracking']),
  height_cm: z.number().positive().optional().nullable(),
  weight_kg: z.number().positive().optional().nullable(),
  age: z.number().int().min(16).max(120).optional().nullable(),
  sex: z.enum(['male', 'female', 'unspecified']).optional().nullable().default('unspecified'),
  activity_level: z.enum(['sedentary', 'moderate', 'active']).optional().default('moderate'),
});

export type GoalCalculationInput = z.input<typeof GoalCalculationInputSchema>;

export const GoalCalculationOutputSchema = z.object({
  goal_type: z.enum(['lose', 'maintain', 'gain', 'tracking']),
  calorie_target: z.number().int().nullable(),
  protein_g: z.number().int().nullable(),
  carbs_g: z.number().int().nullable(),
  fat_g: z.number().int().nullable(),
  dc_translation: z.string(),
  is_default_fallback: z.boolean(),
  notes: z.array(z.string()),
});

export type GoalCalculationOutput = z.infer<typeof GoalCalculationOutputSchema>;

// Wellbeing Clamps (§11)
export const MIN_CALORIE_FLOOR = 1200; // Strict hard floor
export const MAX_WEEKLY_DEFICIT_CALORIES = 500; // Rate clamp of max 1.0 lb/week (0.5 lb/wk = 250 kcal)

/**
 * Calculates daily targets using Mifflin-St Jeor with strict §11 wellbeing guardrails.
 */
export function calculateGoals(input: GoalCalculationInput): GoalCalculationOutput {
  const validated = GoalCalculationInputSchema.parse(input);

  if (validated.goal_type === 'tracking') {
    return {
      goal_type: 'tracking',
      calorie_target: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      dc_translation: 'Log meals without targets or limits. Observe your daily nutrition naturally.',
      is_default_fallback: false,
      notes: ['Just tracking mode active — no calorie limits or deficits applied.'],
    };
  }

  // Fallbacks if user skipped fields during onboarding
  const weight_kg = validated.weight_kg ?? 76.2; // 168 lb default
  const height_cm = validated.height_cm ?? 177.8; // 5' 10" default
  const age = validated.age ?? 19;
  const isFallback = !validated.weight_kg || !validated.height_cm || !validated.age;

  // Mifflin-St Jeor BMR
  let sexOffset = -78; // neutral average
  if (validated.sex === 'male') sexOffset = 5;
  if (validated.sex === 'female') sexOffset = -161;

  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + sexOffset;

  // Activity Multipliers
  let multiplier = 1.45; // Moderate: Walking campus, gym 2-3x
  if (validated.activity_level === 'sedentary') multiplier = 1.2;
  if (validated.activity_level === 'active') multiplier = 1.7;

  const tdee = Math.round(bmr * multiplier);

  // Goal adjustments with rate clamp (§11)
  let rawTarget = tdee;
  if (validated.goal_type === 'lose') {
    // 0.5 lb/week gentle deficit = -250 kcal/day
    rawTarget = tdee - 250;
  } else if (validated.goal_type === 'gain') {
    // Small surplus with protein focus = +250 kcal/day
    rawTarget = tdee + 250;
  }

  // ENFORCE HARD FLOOR OF 1200 KCAL/DAY (§11 Guardrail #1)
  const finalCalorieTarget = Math.max(MIN_CALORIE_FLOOR, rawTarget);

  // Macro distribution:
  // Protein: ~2.0g per kg or ~25%
  const proteinGrams = Math.round((finalCalorieTarget * 0.25) / 4);
  // Fat: ~28%
  const fatGrams = Math.round((finalCalorieTarget * 0.28) / 9);
  // Carbs: Remainder (~47%)
  const carbsGrams = Math.round((finalCalorieTarget - (proteinGrams * 4 + fatGrams * 9)) / 4);

  // DC Translation copy from §4 Screen 05
  let dcTranslation = 'Roughly a DC breakfast, a full lunch plate, and dinner with dessert.';
  if (finalCalorieTarget > 2500) {
    dcTranslation = 'Roughly a hearty DC breakfast, double lunch portions, and full dinner with dessert.';
  } else if (finalCalorieTarget < 1900) {
    dcTranslation = 'Roughly a DC breakfast, a balanced lunch plate, and lighter dinner.';
  }

  return {
    goal_type: validated.goal_type,
    calorie_target: finalCalorieTarget,
    protein_g: proteinGrams,
    carbs_g: carbsGrams,
    fat_g: fatGrams,
    dc_translation: dcTranslation,
    is_default_fallback: isFallback,
    notes: isFallback ? ['Using conservative campus averages for skipped fields.'] : [],
  };
}
