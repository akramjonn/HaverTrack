import { supabase } from '@/lib/supabase';
import { AnalyzePlateResponse, AnalyzePlateResponseSchema } from './types';
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
 * Sends the photo (or a typed description) to the `analyze-photo` Edge
 * Function, which identifies the food with Claude Sonnet 5 vision.
 *
 * There is deliberately no on-device fallback. The previous one "resolved" an
 * unrecognised plate by returning whatever dish happened to be first on the
 * Main Line, so a photo of anything at all came back with a confident,
 * completely unrelated dish name and its macros. Numbers a student might eat
 * against are not worth inventing: if the analyzer cannot be reached, this
 * throws and the caller tells them so.
 */
export async function analyzePlate(req: AnalyzeRequest): Promise<AnalyzePlateResponse> {
  const { data, error } = await supabase.functions.invoke('analyze-photo', {
    body: req,
  });

  if (error) {
    // FunctionsHttpError carries the function's own JSON body, which is where
    // the useful message lives ("busy", "not configured", quota reached).
    const detail = await extractFunctionError(error);
    throw new Error(detail ?? 'Could not analyze this photo. Please try again.');
  }

  const parsed = AnalyzePlateResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn('analyze-photo returned an unexpected shape:', parsed.error.message);
    throw new Error('The analyzer returned an unreadable result. Please try again.');
  }

  return parsed.data;
}

async function extractFunctionError(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;

  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Non-JSON body — fall through to the generic message.
    }
  }

  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' && message.length ? message : null;
}
