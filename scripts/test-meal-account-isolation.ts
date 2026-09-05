import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the real store with deterministic storage/network adapters, without
// loading React Native or connecting to any account or database.
const storage = new Map<string, string>();
let account = "account-a";
let state: any;
let resolvePush!: (value: any) => void;
let resolveRead!: (value: any) => void;
let deferRead = false;
const makeMeal = (id: string) => ({
  id,
  client_uuid: id,
  title: id,
  synced: true,
  logged_date: "2026-09-04",
  meal_period: "dinner",
  logged_time: "6:00pm",
  source: "menu",
  total_calories: 100,
  total_protein_g: 2,
  total_carbs_g: 20,
  total_fat_g: 1,
  items: [
    {
      id: "food",
      name: "Rice",
      portion: 1,
      portion_unit: "serving",
      calories: 100,
      protein_g: 2,
      carbs_g: 20,
      fat_g: 1,
    },
  ],
});
const adapters: Record<string, unknown> = {
  zustand: {
    create: (initialize: any) => {
      const set = (patch: any) => {
        state = { ...state, ...patch };
      };
      state = initialize(set, () => state);
      return { getState: () => state };
    },
  },
  "@react-native-async-storage/async-storage": {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
  },
  "@/store/authStore": {
    useAuthStore: { getState: () => ({ user: { id: account } }) },
  },
  "@/lib/stats": { loggingStreak: () => ({ current: 1 }) },
  "@/lib/mealLogs": {
    fetchMealLogs: async (id: string) => {
      if (id === "account-a" && deferRead)
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      return [makeMeal(`${id}-server`)];
    },
    fetchWeightEntries: async () => [],
    pushMealLog: async () =>
      new Promise((resolve) => {
        resolvePush = resolve;
      }),
    deleteMealLogRemote: async () => {},
  },
};
const source = ts.transpileModule(
  readFileSync("src/store/logStore.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
vm.runInNewContext(source, {
  exports: {},
  console,
  Intl,
  Date,
  Math,
  Promise,
  Set,
  require: (name: string) => {
    if (!(name in adapters)) throw new Error(`Unexpected dependency: ${name}`);
    return adapters[name];
  },
});
async function until(predicate: () => boolean) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Expected deferred operation to start");
}
async function main() {
  await state.hydrate(account);
  const saving = state.addMealLog(makeMeal("new-meal"));
  await until(() => !!resolvePush);
  account = "account-b";
  await state.hydrate(account);
  resolvePush(makeMeal("account-a-saved"));
  await saving;
  assert.equal(state.logs[0].id, "account-b-server");
  assert.ok(!storage.get("@havertrack_logs:account-b")?.includes("new-meal"));
  assert.ok(storage.get("@havertrack_logs:account-a")?.includes("new-meal"));
  console.log(
    "PASS: delayed saves cannot populate a different account or cache",
  );

  storage.delete("@havertrack_logs:account-a");
  account = "account-a";
  deferRead = true;
  const reading = state.hydrate(account);
  await until(() => !!resolveRead);
  account = "account-b";
  await state.hydrate(account);
  resolveRead([makeMeal("account-a-private")]);
  await reading;
  assert.equal(state.logs[0].id, "account-b-server");
  assert.ok(
    !storage.get("@havertrack_logs:account-b")?.includes("account-a-private"),
  );
  console.log(
    "PASS: delayed hydration cannot reveal the previous account’s history",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
