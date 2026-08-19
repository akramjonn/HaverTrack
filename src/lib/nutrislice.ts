import { z } from 'zod';

// Zod schemas matching exact Nutrislice API response shapes (Phase 0)

export const NutrisliceFoodIconSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().optional(),
  is_filter: z.boolean().default(false), // true for allergens (Milk, Wheat, Soy, Egg, etc.)
  is_highlight: z.boolean().default(false), // true for dietary tags (Vegan, Vegetarian)
});

export const NutrisliceNutritionInfoSchema = z.object({
  calories: z.number().nullable().optional(),
  g_protein: z.number().nullable().optional(),
  g_carbs: z.number().nullable().optional(),
  g_fat: z.number().nullable().optional(),
  g_saturated_fat: z.number().nullable().optional(),
  g_trans_fat: z.number().nullable().optional(),
  g_fiber: z.number().nullable().optional(),
  g_sugar: z.number().nullable().optional(),
  mg_sodium: z.number().nullable().optional(),
  mg_cholesterol: z.number().nullable().optional(),
  mg_potassium: z.number().nullable().optional(),
  mg_iron: z.number().nullable().optional(),
  mg_calcium: z.number().nullable().optional(),
  mg_vitamin_c: z.number().nullable().optional(),
});

export const NutrisliceFoodSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  ingredients: z.string().nullable().optional(),
  subtext: z.string().nullable().optional(),
  serving_size_info: z
    .object({
      serving_size_amount: z.string().nullable().optional(),
      serving_size_unit: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  rounded_nutrition_info: NutrisliceNutritionInfoSchema.nullable().optional(),
  icons: z
    .object({
      food_icons: z.array(NutrisliceFoodIconSchema).default([]),
    })
    .nullable()
    .optional(),
});

export const NutrisliceMenuItemSchema = z.object({
  id: z.number(),
  is_station_header: z.boolean().default(false),
  station_id: z.number().nullable().optional(),
  text: z.string().nullable().optional(),
  food: NutrisliceFoodSchema.nullable().optional(),
});

export const NutrisliceDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  menu_items: z.array(NutrisliceMenuItemSchema).default([]),
});

export const NutrisliceWeekResponseSchema = z.object({
  start_date: z.string().optional(),
  menu_type_id: z.number().optional(),
  days: z.array(NutrisliceDaySchema).default([]),
});

export type NutrisliceWeekResponse = z.infer<typeof NutrisliceWeekResponseSchema>;

// Parsed database menu item format
export interface ParsedMenuItem {
  nutrislice_id: number;
  location_id: string;
  meal_period: 'breakfast' | 'lunch' | 'dinner' | 'brunch';
  served_date: string;
  station_name: string;
  station_id: number | null;
  dish_name: string;
  description: string | null;
  ingredients: string | null;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  dietary_tags: string[];
  allergens: string[];
  synced_at: string;
}

/**
 * Parses raw Nutrislice JSON response into database-ready structured menu items.
 */
export function parseNutrisliceWeek(
  rawJson: unknown,
  mealPeriod: 'breakfast' | 'lunch' | 'dinner' | 'brunch',
  locationId: string = 'dining-location'
): ParsedMenuItem[] {
  const parsed = NutrisliceWeekResponseSchema.parse(rawJson);
  const results: ParsedMenuItem[] = [];
  const nowIso = new Date().toISOString();

  for (const day of parsed.days) {
    let currentStation = 'Main Station';
    let currentStationId: number | null = null;

    for (const item of day.menu_items) {
      if (item.is_station_header && item.text) {
        currentStation = item.text.trim();
        currentStationId = item.station_id ?? null;
      } else if (item.food) {
        const food = item.food;
        const nutrition = food.rounded_nutrition_info;

        // Parse dietary highlights & allergens from icons
        const dietaryTags: string[] = [];
        const allergens: string[] = [];

        if (food.icons?.food_icons) {
          for (const icon of food.icons.food_icons) {
            if (icon.is_highlight || icon.name === 'Vegan' || icon.name === 'Vegetarian') {
              if (!dietaryTags.includes(icon.name)) dietaryTags.push(icon.name);
            }
            if (icon.is_filter || ['Milk', 'Egg', 'Wheat', 'Soy', 'Peanuts', 'Tree Nuts', 'Sesame', 'Fish'].includes(icon.name)) {
              if (!allergens.includes(icon.name)) allergens.push(icon.name);
            }
          }
        }

        // Add Gluten-Free tag if wheat is not in allergens and food is marked
        if (dietaryTags.includes('Vegan') || dietaryTags.includes('Vegetarian')) {
          if (!allergens.includes('Wheat')) {
            dietaryTags.push('Wheat-Free');
          }
        }

        // Format serving size string
        let servingSize: string | null = null;
        if (food.serving_size_info?.serving_size_amount && food.serving_size_info?.serving_size_unit) {
          servingSize = `${food.serving_size_info.serving_size_amount} ${food.serving_size_info.serving_size_unit}`;
        }

        // Strict §7 Rule: Never coerce null nutrition facts to 0!
        results.push({
          nutrislice_id: food.id,
          location_id: locationId,
          meal_period: mealPeriod,
          served_date: day.date,
          station_name: currentStation,
          station_id: currentStationId,
          dish_name: food.name.trim(),
          description: food.description?.trim() || null,
          ingredients: food.ingredients?.trim() || null,
          serving_size: servingSize,
          calories: nutrition?.calories ?? null,
          protein_g: nutrition?.g_protein ?? null,
          carbs_g: nutrition?.g_carbs ?? null,
          fat_g: nutrition?.g_fat ?? null,
          dietary_tags: dietaryTags,
          allergens: allergens,
          synced_at: nowIso,
        });
      }
    }
  }

  return results;
}
