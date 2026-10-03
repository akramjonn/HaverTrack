import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import ts from 'typescript';
import { parseAuthCallback } from '../src/lib/authCallback';
import { isCollegeEmail } from '../src/lib/authErrors';

interface AuthModule {
  completeAuthCallback(url: string): Promise<void>;
  getAuthRedirectUrl(): string;
  signInWithGoogle(): Promise<boolean>;
}

// Execute the production handler, replacing platform/network adapters only.
function harness() {
  const calls = { exchange: [] as string[], install: 0, user: 0, signOut: [] as unknown[] };
  let user: { email?: string; email_confirmed_at?: string } | null = {
    email: 'student@haverford.edu', email_confirmed_at: '2026-01-01',
  };
  let exchangeError: Error | null = null;
  let userError: Error | null = null;
  let exchangeGate = Promise.resolve();
  const platform = { OS: 'ios' };
  const constants = { executionEnvironment: 'standalone' };
  const auth = {
    exchangeCodeForSession: async (code: string) => {
      calls.exchange.push(code);
      await exchangeGate;
      return { error: exchangeError };
    },
    setSession: async () => { calls.install += 1; return { error: null }; },
    getUser: async () => { calls.user += 1; return { data: { user }, error: userError }; },
    signOut: async (options: unknown) => { calls.signOut.push(options); return { error: null }; },
    signInWithOAuth: async () => ({ data: { url: 'https://provider.invalid' }, error: null }),
  };
  const exports: Partial<AuthModule> = {};
  const adapters: Record<string, unknown> = {
    'expo-constants': { __esModule: true, default: constants, ExecutionEnvironment: { StoreClient: 'store' } },
    'expo-linking': { createURL: () => 'exp://localhost/--/auth/callback' },
    'expo-web-browser': { openAuthSessionAsync: async () => ({ type: 'success', url: 'havertrack://auth/callback?code=native-code' }) },
    'react-native': { Platform: platform },
    './supabase': { supabase: { auth } },
    './authErrors': { isCollegeEmail },
    './authCallback': { parseAuthCallback },
  };
  const source = ts.transpileModule(readFileSync(resolve('src/lib/auth.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Script(source, { filename: 'auth.ts' }).runInNewContext({
    exports, require: (name: string) => {
      assert.ok(name in adapters, `Unexpected dependency ${name}`);
      return adapters[name];
    }, __DEV__: false, console, URL, URLSearchParams,
  });
  return {
    calls, exports: exports as AuthModule, platform, constants,
    setUser: (value: typeof user) => { user = value; },
    failExchange: () => { exchangeError = new Error('Missing PKCE verifier'); },
    failUser: () => { userError = new Error('User lookup failed'); },
    pauseExchange: (gate: Promise<void>) => { exchangeGate = gate; },
  };
}

async function main() {
  const rejected = harness();
  for (const suffix of [
    '?access_token=attacker&refresh_token=attacker', '#access_token=attacker&refresh_token=attacker',
    '?access_token=attacker#refresh_token=attacker', '?%61ccess_token=attacker&%72efresh_token=attacker',
    '?code=valid#access_token=attacker&refresh_token=attacker', '?refresh_token=',
  ]) {
    await assert.rejects(rejected.exports.completeAuthCallback(`havertrack://auth/callback${suffix}`), /Return to sign in/);
  }
  await assert.rejects(rejected.exports.completeAuthCallback('havertrack://auth/callback'), /incomplete/);
  assert.deepEqual(rejected.calls, { exchange: [], install: 0, user: 0, signOut: [] });

  const valid = harness();
  let release!: () => void;
  valid.pauseExchange(new Promise<void>((done) => { release = done; }));
  const first = valid.exports.completeAuthCallback('havertrack://auth/callback?code=one-use-code');
  const duplicate = valid.exports.completeAuthCallback('havertrack://auth/callback#code=one-use-code');
  assert.equal(first, duplicate);
  // A token-bearing callback cannot bypass parsing through a cached code.
  await assert.rejects(valid.exports.completeAuthCallback('havertrack://auth/callback?code=one-use-code&access_token=a'), /Return to sign in/);
  release();
  await Promise.all([first, duplicate]);
  await valid.exports.completeAuthCallback('havertrack://auth/callback?code=one-use-code');
  assert.deepEqual(valid.calls, { exchange: ['one-use-code'], install: 0, user: 1, signOut: [] });

  const native = harness();
  const routerCallback = native.exports.completeAuthCallback('havertrack://auth/callback?code=native-code');
  assert.equal(await native.exports.signInWithGoogle(), true);
  await routerCallback;
  assert.deepEqual(native.calls.exchange, ['native-code']);
  assert.equal(native.exports.getAuthRedirectUrl(), 'havertrack://auth/callback');
  native.constants.executionEnvironment = 'store';
  assert.equal(native.exports.getAuthRedirectUrl(), 'exp://localhost/--/auth/callback');

  const missingVerifier = harness();
  missingVerifier.failExchange();
  await assert.rejects(missingVerifier.exports.completeAuthCallback('havertrack://auth/callback?code=foreign-device'), /PKCE verifier/);
  assert.equal(missingVerifier.calls.user, 0);
  assert.equal(missingVerifier.calls.install, 0);

  for (const user of [null, { email: 'attacker@example.com', email_confirmed_at: '2026-01-01' }, { email: 'student@haverford.edu' }]) {
    const ineligible = harness();
    ineligible.setUser(user);
    await assert.rejects(ineligible.exports.completeAuthCallback('havertrack://auth/callback?code=ineligible'), /verified @haverford.edu/);
    assert.equal(ineligible.calls.signOut.length, 1);
    assert.equal((ineligible.calls.signOut[0] as { scope: string }).scope, 'local');
    assert.equal(ineligible.calls.install, 0);
  }
  const lookupFailure = harness();
  lookupFailure.failUser();
  await assert.rejects(lookupFailure.exports.completeAuthCallback('havertrack://auth/callback?code=lookup-failure'), /User lookup failed/);
  console.log('Production auth callback tests passed: URL tokens rejected, PKCE/dedup preserved, eligibility failures rejected.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
