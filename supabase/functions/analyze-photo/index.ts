import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

// Set as a Supabase edge-function secret (`supabase secrets set
// ANTHROPIC_API_KEY=...`), never in source. Absent means the function is
// deployed but unconfigured, which we report as a 503 rather than a crash.
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

// Claude Sonnet 5 is the only analyzer. There is deliberately no second
// provider and no fallback path: an unreachable model has to surface as an
// error, because the alternative is handing a student invented macros.
const ANTHROPIC_MODEL = 'claude-sonnet-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// Messages API wire version, required on every request. It versions the
// request/response shape, not the model, so it stays put when the model id
// moves.
const ANTHROPIC_VERSION = '2023-06-01';

// Adaptive thinking is on by default on Sonnet 5 and draws from this same
// budget, so the ceiling has to cover the reasoning and the JSON together. A
// ten-item plate is roughly 1.5k tokens of JSON; the rest is headroom. Too low
// and the turn ends with stop_reason "max_tokens" holding half an object.
const MAX_OUTPUT_TOKENS = 8000;

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

// What we ask the model to produce — everything the model can actually know.
// quota_remaining and is_fallback_estimate are server-injected afterward, not
// model output, so they are absent here.
//
// This is plain JSON Schema, which is what the Messages API structured-output
// format takes. Two of its rules shape what follows: every object must carry
// additionalProperties: false, and numeric/string constraints (minimum,
// maximum, minLength) are unsupported — the 0..1 bounds on the confidence
// fields therefore live only in the zod schemas above, which still run over
// the model's output before anything is returned.
const PLATE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    portion: { type: 'number' },
    portion_unit: { type: 'string' },
    // Explicitly nullable: the prompt asks for a literal null when nothing
    // matched, and the zod mirror above accepts null here.
    matched_menu_item_id: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    is_menu_match: { type: 'boolean' },
    confidence_score: { type: 'number' },
    calories: { type: 'integer' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
    // Plain string rather than a nullable one, unlike the other optionals.
    // The zod mirror types notes as .optional(), which rejects an explicit
    // null — so permitting null here would let the model emit something the
    // validator below throws out. Merely leaving it out of `required` means
    // the model omits the key instead, which zod is happy with.
    notes: { type: 'string' },
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
  additionalProperties: false,
};

const PLATE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    dish_title: { type: 'string' },
    // Same reasoning as notes above — .optional() in zod, so omitted rather
    // than null.
    dish_subtitle: { type: 'string' },
    matched_station: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    match_confidence: { type: 'number' },
    items: { type: 'array', items: PLATE_ITEM_SCHEMA },
    total_calories: { type: 'integer' },
    total_protein_g: { type: 'number' },
    total_carbs_g: { type: 'number' },
    total_fat_g: { type: 'number' },
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
  additionalProperties: false,
};

function buildPrompt(menuContextText: string, describeText?: string) {
  return `You are SquirrelTrack Vision. A student at Haverford College has ${describeText ? 'described' : 'photographed'} their meal.

STEP 1 — IDENTIFY THE FOOD ON ITS OWN MERITS.
Work out what each distinct food item actually is, purely from what you can ${describeText ? 'read in their description' : 'see'}. Do not consult any menu for this step. Do not let the list below influence what you think the food is. If it is a burrito, say burrito — even if no burrito appears on the menu.

STEP 2 — ESTIMATE ITS NUTRITION YOURSELF.
For every item, give your own honest calories/protein/carbs/fat estimate based on what it is and how much of it there appears to be, using your general knowledge of food. This is your baseline answer and it must stand on its own.

STEP 3 — ONLY NOW, CHECK FOR A DINING CENTER MATCH.
Here is what the Dining Center is serving this meal:
${menuContextText || '(no menu data available for this meal period)'}

For each item you identified in step 1, ask: is this genuinely the same dish as one of the entries above? Judge that on the food itself, not on similarity of wording.
- If YES — it is clearly the same dish — set is_menu_match: true, set matched_menu_item_id to that entry's [ID], and REPLACE your step-2 estimate with that entry's exact calories and macros. Those figures are dietitian-certified and are better than your estimate.
- If NO — set is_menu_match: false, matched_menu_item_id: null, and KEEP your own step-2 estimate.

Never force a match. An unmatched item with your honest estimate is a correct, useful answer; a wrong match reports someone else's food as this student's. When nothing on the plate matches the menu, it is entirely normal for every item to come back is_menu_match: false — that is the expected result for outside food, and you must still return your own real estimates rather than reaching for the nearest menu entry.

OUTPUT RULES.
- confidence_score is per item: how sure you are of the identification and amount. A matched item is typically 0.8–0.95; an unmatched visual estimate is typically 0.5–0.75.
- match_confidence is your confidence in the whole-plate read overall.
- total_* fields are the sums across all items.
- Give each item a short unique id ("item-1", "item-2", ...).
- dish_title should name the meal as a person would say it, e.g. "Chicken burrito with rice".
${describeText ? `\nThe student described their plate as: "${describeText}". No photo was provided — work from this description alone.` : '\nAnalyze the attached photo.'}`;
}

interface AnalyzerFailure {
  status: number;
  message: string;
}

/** Never forward Anthropic's raw error text to the client — only a safe, mapped message. */
function mapAnthropicFailure(status: number, body: any): AnalyzerFailure {
  const errorType = body?.error?.type;

  // 429 is our own rate limit against the API; 529 is Anthropic shedding load
  // on their side. Both clear on their own within seconds, so both get the
  // "try again in a moment" copy rather than the dead-end one. 529 has to be
  // caught before the >= 500 branch below.
  if (status === 429 || status === 529 || errorType === 'overloaded_error') {
    return { status: 429, message: 'The photo analyzer is busy right now. Try again in a moment.' };
  }
  // A rejected key is our misconfiguration, not a problem with their photo —
  // same situation as a missing key, so the same message and status.
  if (status === 401 || status === 403) {
    return { status: 503, message: 'Photo analysis is not configured yet. Please use manual menu logging.' };
  }
  // The base64 image dwarfs everything else in the request body, so a size
  // rejection is effectively always the photo.
  if (status === 413) {
    return { status: 400, message: 'That photo is too large to analyze. Try a smaller shot of the plate.' };
  }
  if (status >= 500) {
    return { status: 502, message: 'The photo analyzer is temporarily unavailable.' };
  }
  // Everything left is a 400 invalid_request_error or similar: a bug in the
  // body we built, which the student can do nothing about.
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

    if (!ANTHROPIC_API_KEY) {
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

    if (!validated.image_base64 && !validated.describe_text) {
      return json({ error: 'Send either a photo or a description of the plate.' }, 400);
    }

    // Image first, then the prompt: the model reads a photo better when the
    // instructions follow it. With describe_text only there is no image block
    // at all and this is an ordinary text message.
    const content: unknown[] = [];
    if (validated.image_base64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: validated.image_base64 },
      });
    }
    content.push({ type: 'text', text: buildPrompt(menuContextText, validated.describe_text) });

    let anthropicRes: Response;
    try {
      anthropicRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          output_config: {
            // Sonnet 5 rejects temperature/top_p/top_k outright with a 400, so
            // the old temperature: 0.2 has no direct equivalent. Effort is the
            // knob that replaces it: medium keeps the read deliberate without
            // paying for a long reasoning trace on what is usually one plate.
            effort: 'medium',
            // Structured outputs constrain the model to emit JSON matching
            // this schema, so there is no "reply with JSON" plea in the prompt
            // and no markdown fence to strip off the front. Unlike a forced
            // tool_choice, it also composes with thinking, which is on by
            // default on this model.
            format: { type: 'json_schema', schema: PLATE_RESPONSE_SCHEMA },
          },
          messages: [{ role: 'user', content }],
        }),
      });
    } catch (networkErr) {
      console.error('Anthropic network error:', networkErr);
      return json({ error: 'Could not reach the photo analyzer. Check your connection.' }, 502);
    }

    const anthropicJson = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', anthropicRes.status, JSON.stringify(anthropicJson));
      const failure = mapAnthropicFailure(anthropicRes.status, anthropicJson);
      return json({ error: failure.message }, failure.status);
    }

    // A refusal or a truncation both come back as a perfectly ordinary 200, so
    // stop_reason has to be read before the content is. "refusal" is a safety
    // decline and never carries schema-valid JSON; "max_tokens" means the JSON
    // was cut mid-object and parsing it would only produce a confusing error.
    const stopReason = anthropicJson?.stop_reason;
    if (stopReason === 'refusal') {
      console.error('Anthropic declined the request:', JSON.stringify(anthropicJson?.stop_details ?? null));
      return json({ error: 'Could not analyze this photo. Try a clearer shot of just the plate.' }, 400);
    }
    if (stopReason === 'max_tokens') {
      console.error('Anthropic hit max_tokens before finishing the plate JSON');
      return json({ error: 'The photo analyzer returned an unreadable result.' }, 502);
    }

    // The answer arrives as a text block holding the JSON. Thinking blocks can
    // precede it in content, so filter by type rather than indexing [0].
    const contentBlocks = Array.isArray(anthropicJson?.content) ? anthropicJson.content : [];
    const outputText = contentBlocks
      .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
      .map((block: any) => block.text)
      .join('');

    if (!outputText) {
      console.error('Anthropic returned no text block:', JSON.stringify(anthropicJson));
      return json({ error: 'Could not analyze this photo. You can search the menu directly instead.' }, 502);
    }

    let parsedModelOutput: unknown;
    try {
      parsedModelOutput = JSON.parse(outputText);
    } catch (parseErr) {
      console.error('Anthropic response was not valid JSON:', outputText);
      return json({ error: 'The photo analyzer returned an unreadable result.' }, 502);
    }

    const validationResult = AnalyzePlateResponseSchema.omit({
      quota_remaining: true,
      is_fallback_estimate: true,
    }).safeParse(parsedModelOutput);

    if (!validationResult.success) {
      console.error('Model output failed schema validation:', validationResult.error.message, outputText);
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
