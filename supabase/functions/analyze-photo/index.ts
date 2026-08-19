import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const AnalyzeRequestSchema = z.object({
  image_base64: z.string().optional(),
  image_storage_path: z.string().optional(),
  describe_text: z.string().optional(),
  meal_period: z.enum(['breakfast', 'lunch', 'dinner', 'brunch']).default('lunch'),
  served_date: z.string().optional(),
});

// Mirrors src/lib/llm/types.ts. Duplicated rather than imported: this function
// runs on Deno and that file is written for the RN/bare-'zod' bundler graph.
// Keep the two in sync by hand if either changes.
const ScannedPlateItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  portion: z.number().default(1.0),
  portion_unit: z.string().default('serving'),
  matched_menu_item_id: z.number().nullable().optional(),
  is_menu_match: z.boolean().default(false),
  confidence_score: z.number().min(0).max(1),
  calories: z.number().int(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  notes: z.string().optional(),
});

const AnalyzePlateResponseSchema = z.object({
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

// What we ask Gemini to produce — everything the model can actually know.
// quota_remaining and is_fallback_estimate are server-injected afterward, not
// model output, so they are absent here.
const GEMINI_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    name: { type: 'STRING' },
    portion: { type: 'NUMBER' },
    portion_unit: { type: 'STRING' },
    matched_menu_item_id: { type: 'INTEGER', nullable: true },
    is_menu_match: { type: 'BOOLEAN' },
    confidence_score: { type: 'NUMBER' },
    calories: { type: 'INTEGER' },
    protein_g: { type: 'NUMBER' },
    carbs_g: { type: 'NUMBER' },
    fat_g: { type: 'NUMBER' },
    notes: { type: 'STRING', nullable: true },
  },
  required: [
    'id',
    'name',
    'portion',
    'portion_unit',
    'is_menu_match',
    'confidence_score',
    'calories',
    'protein_g',
    'carbs_g',
    'fat_g',
  ],
};

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    dish_title: { type: 'STRING' },
    dish_subtitle: { type: 'STRING', nullable: true },
    matched_station: { type: 'STRING', nullable: true },
    match_confidence: { type: 'NUMBER' },
    items: { type: 'ARRAY', items: GEMINI_ITEM_SCHEMA },
    total_calories: { type: 'INTEGER' },
    total_protein_g: { type: 'NUMBER' },
    total_carbs_g: { type: 'NUMBER' },
    total_fat_g: { type: 'NUMBER' },
  },
  required: [
    'dish_title',
    'match_confidence',
    'items',
    'total_calories',
    'total_protein_g',
    'total_carbs_g',
    'total_fat_g',
  ],
};

function buildPrompt(menuContextText: string, describeText?: string) {
  return `You are SquirrelTrack Vision, analyzing a student's meal at Haverford College Dining Center.

TODAY'S HAVERFORD DC MENU (the ONLY dishes you may treat as a menu match):
${menuContextText || '(no menu items available for this meal period)'}

Rules:
1. Identify each distinct food item on the plate (or described by the student).
2. For each item, try to match it to one of the exact dishes listed above. If it matches, set is_menu_match: true, matched_menu_item_id to that dish's [ID], and use THAT DISH'S calories/macros exactly rather than estimating your own — the menu numbers are dietitian-certified and must not be overridden by a visual guess.
3. If an item is not on the menu (a personal snack, a condiment, something off-menu), set is_menu_match: false, matched_menu_item_id: null, and give your own honest estimate with a lower confidence_score (0.4–0.7).
4. total_calories/protein_g/carbs_g/fat_g are the sum across all items.
5. match_confidence is your overall confidence in the whole-plate read (not any single item).
6. Give each item a short unique id ("item-1", "item-2", ...).
${describeText ? `\nThe student described their plate as: "${describeText}". No photo was provided — work from this description alone.` : '\nAnalyze the attached photo of the plate.'}`;
}

interface GeminiFailure {
  status: number;
  message: string;
}

/** Never forward Gemini's raw error text to the client — only a safe, mapped message. */
function mapGeminiFailure(status: number, body: any): GeminiFailure {
  const blockReason =
    body?.promptFeedback?.blockReason ??
    body?.candidates?.[0]?.finishReason;

  if (status === 429) {
    return { status: 429, message: 'The photo analyzer is busy right now. Try again in a moment.' };
  }
  if (blockReason === 'SAFETY' || blockReason === 'BLOCKED' || blockReason === 'PROHIBITED_CONTENT') {
    return { status: 400, message: 'Could not analyze this photo. Try a clearer shot of just the plate.' };
  }
  if (status >= 500) {
    return { status: 502, message: 'The photo analyzer is temporarily unavailable.' };
  }
  return { status: 502, message: 'Could not analyze this photo. You can search the menu directly instead.' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userRes = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userRes.error || !userRes.data.user) {
      return json({ error: 'Unauthorized user' }, 401);
    }

    const userId = userRes.data.user.id;

    // Enforce 25 scans/day quota (§8)
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('meal_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('logged_date', today)
      .eq('source', 'scan');

    const scansUsed = count ?? 0;
    if (scansUsed >= 25) {
      return json(
        { error: 'Daily scan limit reached (25 scans/day). Please use manual menu logging.' },
        429
      );
    }

    const body = await req.json();
    const validated = AnalyzeRequestSchema.parse(body);

    if (!GEMINI_API_KEY) {
      return json(
        { error: 'Photo analysis is not configured yet. Please use manual menu logging.' },
        503
      );
    }

    // Fetch today's menu items for this meal period to constrain the match
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('*')
      .eq('meal_period', validated.meal_period)
      .eq('served_date', validated.served_date || today);

    const menuContextText = (menuItems || [])
      .map(
        (item) =>
          `- [ID: ${item.nutrislice_id}] "${item.dish_name}" at ${item.station_name} (${item.calories ?? '?'} kcal, ${item.protein_g ?? '?'}P ${item.carbs_g ?? '?'}C ${item.fat_g ?? '?'}F)`
      )
      .join('\n');

    const parts: unknown[] = [{ text: buildPrompt(menuContextText, validated.describe_text) }];
    if (validated.image_base64) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: validated.image_base64 } });
    }

    if (!validated.image_base64 && !validated.describe_text) {
      return json({ error: 'Send either a photo or a description of the plate.' }, 400);
    }

    let geminiRes: Response;
    try {
      geminiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA,
            temperature: 0.2,
          },
        }),
      });
    } catch (networkErr) {
      console.error('Gemini network error:', networkErr);
      return json({ error: 'Could not reach the photo analyzer. Check your connection.' }, 502);
    }

    const geminiJson = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiRes.status, JSON.stringify(geminiJson));
      const failure = mapGeminiFailure(geminiRes.status, geminiJson);
      return json({ error: failure.message }, failure.status);
    }

    const candidateText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      console.error('Gemini returned no candidate text:', JSON.stringify(geminiJson));
      const failure = mapGeminiFailure(geminiRes.status, geminiJson);
      return json({ error: failure.message }, failure.status);
    }

    let parsedModelOutput: unknown;
    try {
      parsedModelOutput = JSON.parse(candidateText);
    } catch (parseErr) {
      console.error('Gemini response was not valid JSON:', candidateText);
      return json({ error: 'The photo analyzer returned an unreadable result.' }, 502);
    }

    const validationResult = AnalyzePlateResponseSchema.omit({
      quota_remaining: true,
      is_fallback_estimate: true,
    }).safeParse(parsedModelOutput);

    if (!validationResult.success) {
      console.error('Gemini output failed schema validation:', validationResult.error.message, candidateText);
      return json({ error: 'The photo analyzer returned an unexpected result. Try again.' }, 502);
    }

    return json({
      ...validationResult.data,
      quota_remaining: 25 - scansUsed - 1,
      is_fallback_estimate: false,
    });
  } catch (err: any) {
    console.error('analyze-photo unhandled error:', err);
    return json({ error: err?.message ?? 'Something went wrong analyzing this photo.' }, 400);
  }
});
