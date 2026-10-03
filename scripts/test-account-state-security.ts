import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production stores and screens with deterministic adapters. No
// React Native runtime, account credentials, or external services are used.
const storage = new Map<string, string>();
const modules = new Map<string, any>();
const authListeners = new Set<(event: string, session: any) => void>();
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const restore = deferred<any>();
let deviceCleanup = Promise.resolve();
let readFavorites = async (id: string): Promise<any[]> => [{ id, dish_name: id }];
let saveFavorite = async (_id: string, input: any): Promise<any> => input;
let removeFavorite = async () => {};
let readLogs = async (id: string): Promise<any[]> => [meal(`${id}-meal`)];
let saveLog = async (_id: string, value: any): Promise<any> => ({ ...value, id: 'saved-meal' });
let upload = async (): Promise<string> => 'account-a/photo.jpg';
let scanSaves = 0;
let remoteSignOuts = 0;
const navigation: string[] = [];
const react = {
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }),
  useState: (value: any) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
};
const adapters: Record<string, any> = {
  zustand: { create: (initialize: any) => {
    let state: any;
    const listeners = new Set<any>();
    const set = (patch: any) => {
      const previous = state;
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      for (const listener of listeners) listener(state, previous);
    };
    const hook: any = (selector: any) => selector(state);
    hook.getState = () => state;
    hook.setState = set;
    hook.subscribe = (listener: any) => { listeners.add(listener); return () => listeners.delete(listener); };
    state = initialize(set, () => state);
    return hook;
  } },
  '@react-native-async-storage/async-storage': {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
    removeItem: async (key: string) => { storage.delete(key); },
    multiRemove: async (keys: string[]) => { keys.forEach(key => storage.delete(key)); },
  },
  '@/lib/supabase': { supabase: {
    auth: {
      onAuthStateChange: (callback: any) => { authListeners.add(callback); return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }; },
      getSession: () => restore.promise,
      signOut: async () => { remoteSignOuts++; emit(null); return { error: null }; },
    },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }),
  } },
  '@/lib/authErrors': { isCollegeEmail: (email: string) => email.endsWith('@haverford.edu') },
  '@/lib/notifications': { removeRatingDevice: () => deviceCleanup },
  '@/lib/observability': { trackOperationalEvent: () => {}, operationalErrorCode: () => 'mock' },
  '@/lib/stats': { loggingStreak: () => ({ current: 1 }) },
  '@/lib/mealLogs': {
    fetchMealLogs: (id: string) => readLogs(id), fetchWeightEntries: async () => [{ id: 'weight-a', weight_kg: 70, recorded_on: '2026-10-03' }],
    pushMealLog: (id: string, value: any) => saveLog(id, value), pushWeightEntry: async (_id: string, value: any) => value,
    deleteMealLogRemote: async () => {}, uploadMealPhoto: () => upload(),
  },
  '@/lib/favorites': { fetchFavorites: (id: string) => readFavorites(id), pushFavorite: (id: string, input: any) => saveFavorite(id, input), deleteFavorite: () => removeFavorite(), touchFavorite: async () => {} },
  '../data/menus/latest.json': { synced_at: '2026-10-03', items: [] },
  '@/lib/mealFlow': { compareMenuOrder: () => 0 },
  '@/lib/menuDates': { indexBundledMenu: (items: any) => items },
  react,
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', StyleSheet: { create: (s: any) => s } },
  'expo-router': { useRouter: () => ({ replace: (route: string) => navigation.push(route), back: () => {} }), Stack: Object.assign('Stack', { Screen: 'Screen', Protected: 'Protected' }) },
  '@/constants/theme': { Colors: {}, Typography: {}, Radii: {} },
  '@/components/ui': new Proxy({}, { get: (_target, key) => key }),
  '@/components/PhotoDetailSheet': { PhotoDetailSheet: 'PhotoDetailSheet', usePhotoDetailSheetControls: () => null },
  'lucide-react-native': new Proxy({}, { get: (_target, key) => key }),
  '@/lib/health': { scoreMeal: () => null },
  '@/components/HealthScore': { HealthScoreCard: 'HealthScoreCard' },
  '@/lib/mealNutrients': { saveMealNutrients: async () => {} },
};

function load(file: string): any {
  if (modules.has(file)) return modules.get(file);
  const exports: any = {};
  modules.set(file, exports);
  const source = readFileSync(file, 'utf8') + (file.endsWith('scan/review.tsx') ? '\nexport { OwnedScanReview as TestOwnedReview };' : '');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { exports, console: { ...console, warn: () => {} }, Intl, Date, Math, Promise, Set,
    // Profile loading is independently covered; keep scheduled tasks inert here.
    setTimeout: () => 0,
    require: (name: string) => {
      if (name in adapters) return adapters[name];
      if (name.startsWith('@/store/')) return load(`src/${name.slice(2)}.ts`);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return exports;
}
function emit(id: string | null) {
  const session = id ? { user: { id, email: `${id}@haverford.edu`, email_confirmed_at: '2026-10-03' } } : null;
  authListeners.forEach(listener => listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}
function meal(id: string): any { return { id, client_uuid: id, title: id, synced: true, logged_date: '2026-10-03', meal_period: 'dinner', logged_time: '6pm', source: 'scan', items: [], total_calories: 100, total_protein_g: 1, total_carbs_g: 2, total_fat_g: 3 }; }
async function ticks() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function findButton(tree: any): any {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === 'Button' && tree.props.label === 'Done') return tree;
  for (const value of Object.values(tree.props ?? {})) {
    for (const child of Array.isArray(value) ? value : [value]) { const found = findButton(child); if (found) return found; }
  }
  return null;
}
async function main() {
  const authModule = load('src/store/authStore.ts');
  const auth = authModule.useAuthStore;
  auth.getState().initAuth();
  const logs = load('src/store/logStore.ts').useLogStore;
  const favorites = load('src/store/menuStore.ts').useMenuStore;
  const scans = load('src/store/scanStore.ts').useScanStore;
  emit('account-a');
  await logs.getState().hydrate('account-a');
  await favorites.getState().hydrateFavorites('account-a');
  const aScope = authModule.captureAccountScope();
  const result = { dish_title: 'A private plate', items: [] };
  assert.equal(scans.getState().setScan(aScope, result, { uri: 'private-a.jpg', base64: 'private-a' }, 'dinner'), true);
  emit('account-b');
  assert.equal(favorites.getState().favorites.length, 0);
  assert.equal(favorites.getState().favoritesLoaded, false);
  assert.equal(logs.getState().logs.length, 0);
  assert.equal(logs.getState().weightEntries.length, 0);
  assert.equal(scans.getState().currentPhoto, null);
  assert.equal(scans.getState().setScan(aScope, result, null, 'dinner'), false);
  await assert.rejects(logs.getState().addMealLog(meal('old'), 'account-a'), /account changed/);
  console.log('PASS: direct account replacement synchronously clears all personal stores before tab hydration');

  const oldFavorites = deferred<any[]>();
  emit('account-a');
  readFavorites = () => oldFavorites.promise;
  const hydrating = favorites.getState().hydrateFavorites('account-a');
  emit('account-b'); emit('account-a');
  oldFavorites.resolve([{ dish_name: 'departed A data' }]);
  await hydrating;
  assert.equal(favorites.getState().favorites.length, 0);
  assert.equal(scans.getState().setScan(aScope, result, null, 'dinner'), false);
  const pendingSave = deferred<any>();
  saveFavorite = () => pendingSave.promise;
  const favoriteSaving = favorites.getState().saveFavorite({ dish_name: 'private-a' });
  emit('account-b'); pendingSave.resolve({ dish_name: 'private-a' }); await favoriteSaving;
  assert.equal(favorites.getState().favorites.length, 0);
  console.log('PASS: delayed favorite loads/saves and scan results cannot cross A→B→A identity generations');

  emit('account-a');
  readFavorites = async () => [{ dish_name: 'private-a' }];
  await favorites.getState().hydrateFavorites('account-a');
  const pendingDelete = deferred<void>(); removeFavorite = () => pendingDelete.promise;
  const deleting = favorites.getState().removeFavorite('private-a');
  emit('account-b'); pendingDelete.reject(new Error('offline')); await deleting;
  assert.equal(favorites.getState().favorites.length, 0);
  emit('account-a');
  const pendingLog = deferred<any>(); saveLog = () => pendingLog.promise;
  const saving = logs.getState().addMealLog(meal('private-a'));
  await ticks(); emit('account-b'); emit('account-a');
  pendingLog.resolve(meal('stale-server-a')); await saving;
  assert.equal(logs.getState().logs.length, 0);
  const pendingLogs = deferred<any[]>(); readLogs = () => pendingLogs.promise;
  const logHydrating = logs.getState().hydrate('account-a');
  await ticks(); emit('account-b'); emit('account-a');
  pendingLogs.resolve([meal('stale-history')]); await logHydrating;
  assert.equal(logs.getState().logs.length, 0);
  console.log('PASS: failed favorite rollback and delayed log saves/hydration cannot reinstall departed state');

  const cleanup = deferred<void>(); deviceCleanup = cleanup.promise;
  favorites.setState({ favorites: [{ dish_name: 'private-a' }] });
  const departing = auth.getState().user.id;
  const signOutsBefore = remoteSignOuts;
  const signingOut = auth.getState().signOut();
  assert.equal(auth.getState().user, null);
  assert.equal(favorites.getState().favorites.length, 0);
  assert.equal(logs.getState().logs.length, 0);
  // The cleanup RPC may refresh the departing session; that must not sign it back in.
  authListeners.forEach(listener => listener('TOKEN_REFRESHED', { user: { id: departing, email: `${departing}@haverford.edu`, email_confirmed_at: '2026-10-03' } }));
  assert.equal(auth.getState().user, null);
  cleanup.resolve(); await signingOut;
  assert.equal(remoteSignOuts, signOutsBefore + 1);
  // Old launch restoration cannot undo sign-out or replace a newer identity.
  emit('account-b'); restore.resolve({ data: { session: { user: { id: 'account-a', email: 'account-a@haverford.edu', email_confirmed_at: '2026-10-03' } } } });
  await ticks(); assert.equal(auth.getState().user.id, 'account-b');
  console.log('PASS: sign-out clears immediately despite pending cleanup; stale launch restoration is ignored');

  emit('account-a');
  const scope = authModule.captureAccountScope();
  scans.getState().setScan(scope, result, { uri: 'private-a.jpg', base64: 'private-a' }, 'dinner');
  const review = load('src/app/scan/review.tsx');
  // Keep the production store for lifecycle checks, but count the screen's
  // calls into persistence so a post-upload account switch can be observed.
  const originalAdd = logs.getState().addMealLog;
  logs.setState({ addMealLog: async (_meal: any, id: string) => { assert.equal(id, 'account-a'); scanSaves++; } });
  const pendingUpload = deferred<string>(); upload = () => pendingUpload.promise;
  const tree = review.TestOwnedReview({ scanResult: result, currentPhoto: { uri: 'private-a.jpg', base64: 'private-a' }, mealPeriod: 'dinner', owner: scope });
  const button = findButton(tree); assert.ok(button);
  const reviewSaving = button.props.onPress();
  emit('account-b'); pendingUpload.resolve('account-a/photo.jpg'); await reviewSaving;
  assert.equal(scanSaves, 0); assert.equal(navigation.length, 0);
  const empty = review.default(); assert.notEqual(empty.type, 'PhotoDetailSheet');
  emit('account-a');
  const current = authModule.captureAccountScope(); upload = async () => 'account-a/photo.jpg';
  const goodTree = review.TestOwnedReview({ scanResult: result, currentPhoto: { uri: 'private-a.jpg', base64: 'private-a' }, mealPeriod: 'dinner', owner: current });
  await findButton(goodTree).props.onPress();
  assert.equal(scanSaves, 1); assert.equal(navigation.at(-1), '/(tabs)');
  logs.setState({ addMealLog: originalAdd });
  readLogs = async id => [meal(`${id}-meal`)];
  await logs.getState().hydrate('account-a');
  assert.equal(logs.getState().logs[0].id, 'account-a-meal');
  console.log('PASS: account change during photo upload prevents stale save; current-owner scan save and history hydration still work');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
