import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Permanently deletes the calling user. Every table referencing auth.users does so
 * with `on delete cascade`, so removing the auth row takes the profile, goals,
 * logs, weights and favourites with it. Storage objects are not cascaded and have
 * to be removed explicitly.
 *
 * Deleting a user requires the service role, which the client must never hold —
 * hence an Edge Function rather than a client call.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userError } = await admin.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

  const userId = userData.user.id;

  try {
    const { data: photos } = await admin.storage.from('meal-photos').list(userId, { limit: 1000 });
    if (photos?.length) {
      await admin.storage
        .from('meal-photos')
        .remove(photos.map((file) => `${userId}/${file.name}`));
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ deleted: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
