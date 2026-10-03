import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real export implementation with synthetic accounts and platform sinks.
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
let identity: string | null = 'a';
let revision = 0;
let reads = 0;
let downloads = 0;
let writes = 0;
let shares = 0;
let profile: () => Promise<any> = async () => ({ data: { id: 'a', weight_kg: 70 }, error: null });
let available: () => Promise<boolean> = async () => true;
let exported: Blob | undefined;
const platform = { OS: 'web' };
const changeAccount = (id: string | null) => { identity = id; revision++; };
const adapters: Record<string, any> = {
  'expo-file-system': { Paths: { cache: 'synthetic' }, File: class {
    uri = 'synthetic.json';
    create() { writes++; }
    write(contents: string) { assert.equal(JSON.parse(contents).data.profile.id, 'a'); }
  } },
  'expo-sharing': { isAvailableAsync: () => available(), shareAsync: async () => { shares++; } },
  'react-native': { Platform: platform },
  '@/lib/observability': { trackOperationalEvent: () => {}, operationalErrorCode: () => '' },
  '@/store/authStore': {
    requireAccountScope: (expected: string) => {
      if (!identity || identity !== expected) throw new Error('Your account changed');
      return { userId: identity, revision };
    },
    isAccountScopeCurrent: (scope: any) => scope.userId === identity && scope.revision === revision,
  },
  '@/lib/supabase': { supabase: { from: (table: string) => {
    reads++;
    return {
      select() { return this; }, eq() { return this; }, order() { return this; },
      maybeSingle: () => table === 'profiles' ? profile() : Promise.resolve({ data: null, error: null }),
      range: async () => ({ data: [], error: null }),
    };
  } } },
};
const api: any = {};
const js = ts.transpileModule(readFileSync('src/lib/accountExport.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, {
  exports: api, require: (name: string) => { if (!(name in adapters)) throw new Error(name); return adapters[name]; },
  Blob, Date, JSON,
  URL: { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:synthetic'; }, revokeObjectURL: () => {} },
  document: { createElement: () => ({ click: () => { downloads++; } }) },
});

async function main() {
  await api.downloadAccountExport('a');
  assert.equal(downloads, 1);
  assert.equal(JSON.parse(await exported!.text()).data.profile.id, 'a');
  for (const destination of ['b', null, 'a']) {
    changeAccount('a');
    const pending = deferred<any>(); profile = () => pending.promise;
    const work = api.downloadAccountExport('a');
    changeAccount(destination === 'a' ? 'b' : destination);
    if (destination === 'a') changeAccount('a');
    pending.resolve({ data: { id: 'a', weight_kg: 70 }, error: null });
    await assert.rejects(work, /account changed/);
    assert.equal(downloads, 1);
  }
  changeAccount('a');
  const before = reads;
  await assert.rejects(api.downloadAccountExport('b'), /account changed/);
  changeAccount(null);
  await assert.rejects(api.buildAccountExport('a'), /account changed/);
  assert.equal(reads, before);
  changeAccount('a'); platform.OS = 'ios';
  profile = async () => ({ data: { id: 'a' }, error: null });
  const checking = deferred<boolean>();
  const reached = deferred<void>();
  available = () => { reached.resolve(); return checking.promise; };
  const nativeWork = api.downloadAccountExport('a');
  await reached.promise; changeAccount('b'); checking.resolve(true);
  await assert.rejects(nativeWork, /account changed/);
  assert.equal(writes, 0); assert.equal(shares, 0);
  changeAccount('a'); available = async () => true;
  await api.downloadAccountExport('a');
  assert.equal(writes, 1); assert.equal(shares, 1);
  console.log('PASS: exports abort on sign-out, A→B and A→B→A, reject wrong owners before reads, check native sharing readiness, and preserve current-account web/native exports');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
