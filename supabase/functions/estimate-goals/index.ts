import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const GoalCalculationInputSchema = z.object({
  goal_type: z.enum(['lose', 'maintain', 'gain', 'tracking']),
  height_cm: z.number().positive().optional().nullable(),
  weight_kg: z.number().positive().optional().nullable(),
  age: z.number().int().min(16).max(120).optional().nullable(),
  sex: z.enum(['male', 'female', 'unspecified']).optional().default('unspecified'),
  activity_level: z.enum(['sedentary', 'moderate', 'active']).optional().default('moderate'),
});

const MIN_CALORIE_FLOOR = 1200; // Strict hard floor (§11 Guardrail #1)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const json = await req.json();
    const validated = GoalCalculationInputSchema.parse(json);

    if (validated.goal_type === 'tracking') {
      return new Response(
        JSON.stringify({
          goal_type: 'tracking',
          calorie_target: null,
          protein_g: null,
          carbs_g: null,
          fat_g: null,
          dc_translation: 'Log meals without targets or limits. Observe your daily nutrition naturally.',
          is_default_fallback: false,
          notes: ['Just tracking mode active — no calorie limits or deficits applied.'],
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const weight_kg = validated.weight_kg ?? 76.2;
    const height_cm = validated.height_cm ?? 177.8;
    const age = validated.age ?? 19;
    const isFallback = !validated.weight_kg || !validated.height_cm || !validated.age;

    let sexOffset = -78;
    if (validated.sex === 'male') sexOffset = 5;
    if (validated.sex === 'female') sexOffset = -161;

    const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + sexOffset;

    let multiplier = 1.45;
    if (validated.activity_level === 'sedentary') multiplier = 1.2;
    if (validated.activity_level === 'active') multiplier = 1.7;

    const tdee = Math.round(bmr * multiplier);

    let rawTarget = tdee;
    if (validated.goal_type === 'lose') rawTarget = tdee - 250; // 0.5 lb/wk
    if (validated.goal_type === 'gain') rawTarget = tdee + 250;

    // Hard floor 1200 kcal/day
    const finalCalorieTarget = Math.max(MIN_CALORIE_FLOOR, rawTarget);

    const proteinGrams = Math.round((finalCalorieTarget * 0.25) / 4);
    const fatGrams = Math.round((finalCalorieTarget * 0.28) / 9);
    const carbsGrams = Math.round((finalCalorieTarget - (proteinGrams * 4 + fatGrams * 9)) / 4);

    let dcTranslation = 'Roughly a DC breakfast, a full lunch plate, and dinner with dessert.';
    if (finalCalorieTarget > 2500) {
      dcTranslation = 'Roughly a hearty DC breakfast, double lunch portions, and full dinner with dessert.';
    } else if (finalCalorieTarget < 1900) {
      dcTranslation = 'Roughly a DC breakfast, a balanced lunch plate, and lighter dinner.';
    }

    return new Response(
      JSON.stringify({
        goal_type: validated.goal_type,
        calorie_target: finalCalorieTarget,
        protein_g: proteinGrams,
        carbs_g: carbsGrams,
        fat_g: fatGrams,
        dc_translation: dcTranslation,
        is_default_fallback: isFallback,
        notes: isFallback ? ['Using conservative campus averages for skipped fields.'] : [],
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
