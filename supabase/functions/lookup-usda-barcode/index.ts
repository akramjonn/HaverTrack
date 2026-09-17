import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return json({ error: 'Sign in required' }, 401);
  try {
    const { query } = await request.json();
    if (typeof query !== 'string' || !/^\d{8,14}$/.test(query)) return json({ error: 'A valid barcode is required' }, 400);
    const key = Deno.env.get('USDA_API_KEY');
    if (!key) return json({ error: 'USDA is not configured' }, 503);
    const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${new URLSearchParams({ api_key: key, query, dataType: 'Branded', pageSize: '5' })}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return json({ error: 'USDA lookup unavailable' }, 502);
    return json(await response.json());
  } catch { return json({ error: 'USDA lookup could not complete' }, 502); }
});
