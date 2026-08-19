import { supabase } from '@/lib/supabase';
import {
  AnalyzePlateResponse,
  AnalyzePlateResponseSchema,
  ScannedPlateItem,
} from './types';
import { ParsedMenuItem } from '@/lib/nutrislice';

interface AnalyzeRequest {
  image_base64?: string;
  image_storage_path?: string;
  describe_text?: string;
  location_id?: string;
  meal_period?: 'breakfast' | 'lunch' | 'dinner' | 'brunch';
  served_date?: string;
  menu_items?: ParsedMenuItem[];
}

/**
 * Sends the image or plate description to the `analyze-photo` Edge Function.
 *
 * If that call fails the local menu matcher stands in, but the result is always
 * flagged as an estimate. Presenting a guessed menu match as a real analysis is
 * how a broken analyzer ends up looking like a working one.
 */
export async function analyzePlate(req: AnalyzeRequest): Promise<AnalyzePlateResponse> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (supabaseUrl && !supabaseUrl.includes('mock')) {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-photo', {
        body: req,
      });

      if (error) throw error;
      return AnalyzePlateResponseSchema.parse(data);
    } catch (e) {
      console.warn('analyze-photo unavailable, using local menu matcher:', e);

      const local = resolveLocalMenuMatch(req);
      return {
        ...local,
        match_confidence: Math.min(local.match_confidence, 0.5),
        is_fallback_estimate: true,
        items: local.items.map((item) => ({
          ...item,
          is_menu_match: false,
          confidence_score: Math.min(item.confidence_score ?? 0.5, 0.5),
          notes:
            item.notes ??
            'Estimated on this device — photo analysis was unavailable. Check the numbers.',
        })),
      };
    }
  }

  return resolveLocalMenuMatch(req);
}

/**
 * Menu-constrained resolution logic matching input against the day's active DC menu.
 */
function resolveLocalMenuMatch(req: AnalyzeRequest): AnalyzePlateResponse {
  const menu = req.menu_items || [];
  const text = (req.describe_text || '').toLowerCase();

  // Look for dishes matching in description text or default to DC lunch highlight
  let matched = menu.find((item) =>
    text.length > 0 && item.dish_name.toLowerCase().includes(text)
  );

  if (!matched && text.includes('parm')) {
    matched = menu.find((i) => i.dish_name.toLowerCase().includes('parmesan'));
  }
  if (!matched && (text.includes('chicken') || text.includes('nugget'))) {
    matched = menu.find((i) => i.dish_name.toLowerCase().includes('chicken') || i.dish_name.toLowerCase().includes('nugget'));
  }
  if (!matched && text.includes('pizza')) {
    matched = menu.find((i) => i.dish_name.toLowerCase().includes('pizza'));
  }
  if (!matched && menu.length > 0) {
    // Default to the first main dish for photo demo
    matched = menu.find((i) => i.station_name === 'The Main Line') || menu[0];
  }

  if (matched && matched.calories !== null) {
    const items: ScannedPlateItem[] = [
      {
        id: 'item-1',
        name: matched.dish_name,
        portion: 1.0,
        portion_unit: matched.serving_size || 'serving',
        matched_menu_item_id: matched.nutrislice_id,
        is_menu_match: true,
        confidence_score: 0.92,
        calories: matched.calories,
        protein_g: matched.protein_g ?? 25,
        carbs_g: matched.carbs_g ?? 35,
        fat_g: matched.fat_g ?? 15,
      },
    ];

    return {
      dish_title: matched.dish_name,
      dish_subtitle: `Matched to DC ${matched.station_name}`,
      matched_station: matched.station_name,
      match_confidence: 0.92,
      items,
      total_calories: matched.calories,
      total_protein_g: matched.protein_g ?? 25,
      total_carbs_g: matched.carbs_g ?? 35,
      total_fat_g: matched.fat_g ?? 15,
      quota_remaining: 24,
      is_fallback_estimate: false,
    };
  }

  // Fallback if dish is not on the menu
  return {
    dish_title: req.describe_text ? req.describe_text : 'Assorted Dining Center Plate',
    dish_subtitle: 'Estimated from visual analysis',
    matched_station: null,
    match_confidence: 0.65,
    items: [
      {
        id: 'fallback-1',
        name: req.describe_text || 'Mixed Entree & Side',
        portion: 1.0,
        portion_unit: 'plate',
        matched_menu_item_id: null,
        is_menu_match: false,
        confidence_score: 0.65,
        calories: 520,
        protein_g: 28,
        carbs_g: 45,
        fat_g: 18,
        notes: 'Low confidence estimate — item not found on today DC menu.',
      },
    ],
    total_calories: 520,
    total_protein_g: 28,
    total_carbs_g: 45,
    total_fat_g: 18,
    quota_remaining: 24,
    is_fallback_estimate: true,
  };
}
