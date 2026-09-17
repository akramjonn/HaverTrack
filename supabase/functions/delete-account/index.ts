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
    console.info(JSON.stringify({ event: 'account_delete_started' }));
    const bucket = admin.storage.from('meal-photos');
    const pageSize = 100;

    // Storage does not cascade with auth.users. Process every page and stop on
    // any storage failure rather than deleting the auth row with orphaned
    // photos left behind.
    while (true) {
      const { data: photos, error: listError } = await bucket.list(userId, {
        limit: pageSize,
      });
      if (listError) {
        console.error(JSON.stringify({ event: 'account_delete_failed', stage: 'storage_list' }));
        return json({ error: `Could not list account photos: ${listError.message}` }, 500);
      }
      if (!photos?.length) break;

      const paths = photos
        .filter((file) => file.name !== '.emptyFolderPlaceholder')
        .map((file) => `${userId}/${file.name}`);
      if (!paths.length) break;
      if (paths.length) {
        const { error: removeError } = await bucket.remove(paths);
        if (removeError) {
          console.error(JSON.stringify({ event: 'account_delete_failed', stage: 'storage_remove' }));
          return json({ error: `Could not remove account photos: ${removeError.message}` }, 500);
        }
      }
      // Always read offset zero again because each successful remove changes
      // the contents of the next page.
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error(JSON.stringify({ event: 'account_delete_failed', stage: 'auth_delete' }));
      return json({ error: deleteError.message }, 500);
    }

    console.info(JSON.stringify({ event: 'account_delete_completed' }));
    return json({ deleted: true });
  } catch (err) {
    console.error(JSON.stringify({ event: 'account_delete_failed' }));
    return json({ error: (err as Error).message }, 500);
  }
});
