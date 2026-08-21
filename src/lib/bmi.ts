/**
 * BMI — the first feature that grades the *person* rather than the food
 * (see `src/lib/health.ts`). WHO/CDC adult cutoffs (18.5 / 25 / 30) are not
 * clinically valid below age 20, and `profiles.age` defaults to 19 in
 * onboarding, so most users of this app fall exactly where the adult bands
 * don't apply. `bmiCategory` renders a neutral, non-judgmental label for
 * `age < 20` instead of a graded one. See `src/app/bmi-info.tsx` for the
 * full explanation shown to users.
 */

import { z } from 'zod';
import { Colors } from '@/constants/theme';

export type BmiBandKey = 'underweight' | 'healthy' | 'overweight' | 'obese';

export interface BmiBand {
  key: BmiBandKey;
  max: number;
  label: string;
  color: string;
}

/** Upper bound (exclusive-ish) of each band, in ascending order. */
export const BMI_BANDS: BmiBand[] = [
  { key: 'underweight', max: 18.5, label: 'Underweight', color: '#3B82F6' },
  { key: 'healthy', max: 25.0, label: 'Healthy', color: Colors.green },
  { key: 'overweight', max: 30.0, label: 'Overweight', color: Colors.gold },
  { key: 'obese', max: Infinity, label: 'Obese', color: Colors.scarlet },
];

/** Display range for the gradient scale bar — not the data domain. */
export const BMI_SCALE_MIN = 15;
export const BMI_SCALE_MAX = 40;

export const BmiCalculationInputSchema = z.object({
  weight_kg: z.number().optional().nullable(),
  height_cm: z.number().optional().nullable(),
});

export type BmiCalculationInput = z.input<typeof BmiCalculationInputSchema>;

/**
 * bmi = weight_kg / (height_cm / 100) ** 2, rounded to 1 decimal.
 * Returns null when either input is null/0/negative — the empty state
 * (no height on file yet) is a real, expected case, not an error.
 */
export function calculateBmi(input: BmiCalculationInput): number | null {
  const { weight_kg, height_cm } = BmiCalculationInputSchema.parse(input);

  if (!weight_kg || !height_cm || weight_kg <= 0 || height_cm <= 0) return null;

  const meters = height_cm / 100;
  const bmi = weight_kg / (meters * meters);
  if (!Number.isFinite(bmi)) return null;

  return Math.round(bmi * 10) / 10;
}

export interface BmiCategoryResult {
  key: BmiBandKey | 'unscored';
  label: string;
  color: string;
}

/**
 * Categorizes a known BMI value. For `age < 20` (or an unknown age),
 * the adult bands don't apply, so this returns a neutral "Adult ranges
 * shown" result instead of Underweight/Healthy/Overweight/Obese.
 */
export function bmiCategory(bmi: number, age?: number | null): BmiCategoryResult {
  if (age === null || age === undefined || age < 20) {
    return { key: 'unscored', label: 'Adult ranges shown', color: Colors.textMuted };
  }

  const band = BMI_BANDS.find((b) => bmi < b.max) ?? BMI_BANDS[BMI_BANDS.length - 1];
  return { key: band.key, label: band.label, color: band.color };
}

/** 0..1 position of `bmi` along the [BMI_SCALE_MIN, BMI_SCALE_MAX] display range. */
export function bmiScalePosition(bmi: number | null): number {
  if (bmi === null || !Number.isFinite(bmi)) return 0;
  const clamped = Math.max(BMI_SCALE_MIN, Math.min(BMI_SCALE_MAX, bmi));
  return (clamped - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN);
}
