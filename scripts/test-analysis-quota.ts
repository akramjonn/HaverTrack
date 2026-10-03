import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as zodV3 from 'zod/v3';

// Run the real edge handler with its pinned Zod v3 API and deterministic
// adapters. No Deno installation, live account, provider call, or secret needed.
const edgeSource = ts.transpileModule(readFileSync('supabase/functions/analyze-photo/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const plate = {
  dish_title: 'Rice', match_confidence: 0.8,
  items: [{ id: 'rice', name: 'Rice', confidence_score: 0.8, calories: 200, protein_g: 4, carbs_g: 40, fat_g: 1 }],
  total_calories: 200, total_protein_g: 4, total_carbs_g: 40, total_fat_g: 1,
  quota_remaining: 999, // Provider values must never override server usage.
};
type Scenario = {
  quotaResult?: unknown;
  quotaError?: boolean;
  quotaThrows?: boolean;
  authenticated?: boolean;
  configured?: boolean;
  providerFailure?: 'network' | 'status' | 'invalid';
};
function harness(scenario: Scenario = {}) {
  let handler!: (request: Request) => Promise<Response>;
  let used = 0;
  let reservations = 0;
  let paidCalls = 0;
  const events: string[] = [];
  const client = {
    auth: { getUser: async () => ({ error: null, data: { user: scenario.authenticated === false ? null : { id: 'verified-user' } } }) },
    from: (table: string) => {
      assert.equal(table, 'reviewed_menu_items', 'Must not derive quota from mutable meal logs');
      const chain = { select: () => chain, eq: () => chain, then: (resolve: (value: unknown) => void) => resolve({ data: [] }) };
      return chain;
    },
    rpc: async (name: string, args: unknown) => {
      assert.equal(name, 'reserve_analysis_usage');
      assert.equal(JSON.stringify(args), JSON.stringify({ p_user_id: 'verified-user' }));
      events.push('reserve'); reservations++;
      if (scenario.quotaThrows) throw new Error('Database unavailable');
      if (scenario.quotaError) return { data: null, error: { message: 'Database unavailable' } };
      if ('quotaResult' in scenario) return { data: scenario.quotaResult, error: null };
      return { data: used >= 25 ? -1 : 25 - ++used, error: null };
    },
  };
  vm.runInNewContext(edgeSource, {
    exports: {}, Request, Response, Date, JSON, Number,
    console: { error: () => {} },
    Deno: { env: { get: (name: string) => name === 'GEMINI_API_KEY' && scenario.configured === false ? undefined : 'test-placeholder' } },
    require: (name: string) => {
      if (name === 'https://deno.land/std@0.168.0/http/server.ts') return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name === 'https://deno.land/x/zod@v3.22.4/mod.ts') return zodV3;
      if (name === 'https://esm.sh/@supabase/supabase-js@2.39.8') return { createClient: () => client };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: async (url: string, options: RequestInit) => {
      assert.equal(url.startsWith('https://generativelanguage.googleapis.com/'), true);
      assert.ok(reservations > paidCalls, 'Reservation must finish before paid call');
      events.push('provider'); paidCalls++;
      const body = JSON.parse(String(options.body));
      assert.ok(body.contents[0].parts[0].text);
      if (scenario.providerFailure === 'network') throw new Error('Provider disconnected');
      if (scenario.providerFailure === 'status') return new Response(JSON.stringify({ error: { message: 'private provider details' } }), { status: 500 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: scenario.providerFailure === 'invalid' ? '{}' : JSON.stringify(plate) }] } }] }));
    },
  });
  return {
    call: (body: unknown, authorized = true) => handler(new Request('https://local.invalid/analyze-photo', {
      method: 'POST', headers: authorized ? { Authorization: 'Bearer token' } : {}, body: JSON.stringify(body),
    })),
    counts: () => ({ used, reservations, paidCalls }),
  };
}

async function testEdge() {
  for (const scenario of [
    { quotaError: true }, { quotaThrows: true },
    ...[null, undefined, 25, -2, 1.5, '24', {}, NaN].map(quotaResult => ({ quotaResult })),
  ]) {
    const h = harness(scenario);
    assert.equal((await h.call({ describe_text: 'Rice', served_date: '1900-01-01', user_id: 'attacker', limit: 999, quota_remaining: 999 })).status, 503);
    assert.equal(h.counts().paidCalls, 0);
  }
  const denied = harness({ quotaResult: -1 });
  const denial = await denied.call({ image_base64: 'test-photo' });
  assert.equal(denial.status, 429);
  assert.equal((await denial.json()).error, 'Daily scan limit reached (25 scans/day). Please use manual menu logging.');
  assert.equal(denied.counts().paidCalls, 0);
  for (const body of [{ describe_text: 'Rice' }, { image_base64: 'test-photo' }]) {
    const h = harness();
    const response = await h.call(body);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.quota_remaining, 24);
    assert.equal(result.dish_title, 'Rice');
    assert.equal(result.is_fallback_estimate, false);
    assert.equal(h.counts().paidCalls, 1);
  }
  const lastSlot = harness({ quotaResult: 0 });
  assert.equal((await (await lastSlot.call({ describe_text: 'Rice' })).json()).quota_remaining, 0);
  const concurrent = harness();
  const responses = await Promise.all(Array.from({ length: 50 }, (_,i) => concurrent.call(i % 2 ? { image_base64: 'photo' } : { describe_text: 'Rice' })));
  assert.equal(responses.filter(r => r.status === 200).length, 25);
  assert.equal(responses.filter(r => r.status === 429).length, 25);
  assert.equal(concurrent.counts().paidCalls, 25);
  for (const providerFailure of ['network', 'status', 'invalid'] as const) {
    const h = harness({ providerFailure });
    for (let i = 0; i < 25; i++) assert.equal((await h.call({ describe_text: 'Rice' })).status, 502);
    assert.equal((await h.call({ describe_text: 'Rice' })).status, 429);
    assert.equal(h.counts().used, 25);
    assert.equal(h.counts().paidCalls, 25);
  }
  for (const scenario of [{ authenticated: false }, { configured: false }]) {
    const h = harness(scenario);
    await h.call({ describe_text: 'Rice' });
    assert.equal(h.counts().reservations, 0);
    assert.equal(h.counts().paidCalls, 0);
  }
  const invalid = harness();
  assert.equal((await invalid.call({})).status, 400);
  assert.equal((await invalid.call({ describe_text: 123 })).status, 400);
  assert.equal((await invalid.call({ describe_text: 'Rice' }, false)).status, 401);
  assert.equal(invalid.counts().reservations, 0);
  console.log('PASS: real edge handler fails closed before paid fetch, preserves image/description and quota responses, charges failed attempts, allows 25/50 concurrent requests');
}

async function testBarcode() {
  const source = ts.transpileModule(readFileSync('src/lib/productLookup.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  let offMode = 'padded';
  let fdcMode = 'match';
  const offCalls: string[] = [];
  const fdcCalls: string[] = [];
  vm.runInNewContext(source, {
    exports, console, AbortController, setTimeout, clearTimeout,
    require: (name: string) => {
      if (name === 'zod') return { z };
      if (name === '@/lib/supabase') return { supabase: {
        from: () => { throw new Error('The app must never trust or mutate shared cache rows'); },
        functions: { invoke: async (name: string, { body }: any) => {
          assert.equal(name, 'lookup-usda-barcode');
          fdcCalls.push(body.query);
          return { data: { foods: fdcMode === 'match' ? [{ gtinUpc: '0040000503781', description: 'US product', foodNutrients: [
            { nutrientName: 'Energy', value: 480 }, { nutrientName: 'Protein', value: 6 },
          ] }] : [] }, error: null };
        } },
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: async (url: string) => {
      const code = url.split('/').at(-1)!.replace('.json', '');
      offCalls.push(code);
      if (offMode === 'offline') throw new Error('offline');
      const hit = offMode === 'padded' && code === '0123456789012';
      return new Response(JSON.stringify(hit ? { status: 1, product: {
        product_name: 'Trusted label', serving_size: '1 package',
        nutriments: { 'energy-kcal_serving': 120, 'proteins_serving': 3, 'sodium_serving': 0.1 },
      } } : { status: 0 }));
    },
  });
  assert.equal(await exports.lookupBarcode('   '), null);
  const off = await exports.lookupBarcode('123456789012');
  assert.equal(off.name, 'Trusted label');
  assert.equal(off.source, 'off');
  assert.equal(off.barcode, '123456789012');
  assert.equal(off.sodium_mg, 100);
  assert.equal(off.fiber_g, null);
  assert.equal(off.basis, 'serving');
  assert.equal(fdcCalls.length, 0);
  assert.equal(offCalls.includes('0123456789012'), true);
  const adapted = exports.barcodeProductToSearchResult(off);
  assert.equal(adapted.key, 'barcode-123456789012');
  assert.equal(adapted.calories, 120);
  offMode = 'miss';
  const fdc = await exports.lookupBarcode('040000503781');
  assert.equal(fdc.name, 'US product');
  assert.equal(fdc.source, 'fdc');
  assert.equal(fdc.barcode, '040000503781');
  assert.equal(fdc.calories, 480);
  assert.equal(fdc.basis, 'per_100g');
  assert.match(exports.barcodeProductToSearchResult(fdc).subtitle, /USDA/);
  fdcMode = 'miss';
  assert.equal(await exports.lookupBarcode('040000503781'), null);
  offMode = 'offline';
  assert.equal(await exports.lookupBarcode('040000503781'), null);
  console.log('PASS: real barcode lookup ignores shared poisoned hits/misses, preserves padded OFF lookup, USDA fallback, null miss/offline result, nutrition and composer contract');
}
async function main() { await testEdge(); await testBarcode(); }
main().catch(error => { console.error(error); process.exitCode = 1; });
