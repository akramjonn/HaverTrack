import { z } from 'zod';

// Zod Schema for LLM Food Item Breakdown
export const ScannedPlateItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  portion: z.number().default(1.0),
  portion_unit: z.string().default('serving'),
  matched_menu_item_id: z.number().nullable().optional(),
  is_menu_match: z.boolean().default(false),
  confidence_score: z.number().min(0).max(1), // 0 to 1
  calories: z.number().int(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  notes: z.string().optional(),
});

export type ScannedPlateItem = z.infer<typeof ScannedPlateItemSchema>;

export const AnalyzePlateResponseSchema = z.object({
  dish_title: z.string(),
  dish_subtitle: z.string().optional(),
  matched_station: z.string().nullable().optional(),
  match_confidence: z.number().min(0).max(1),
  items: z.array(ScannedPlateItemSchema),
  total_calories: z.number().int(),
  total_protein_g: z.number(),
  total_carbs_g: z.number(),
  total_fat_g: z.number(),
  quota_remaining: z.number().int().optional(),
  is_fallback_estimate: z.boolean().default(false),
});

export type AnalyzePlateResponse = z.infer<typeof AnalyzePlateResponseSchema>;
