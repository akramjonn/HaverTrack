import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { connect, loadEnv } from "./db";
const migration = "20260917050448_nutrition_reviews.sql";
async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
    throw new Error("Missing Supabase project URL");
  const ref = new URL(url).hostname.split(".")[0];
  if (process.argv.includes("--check")) {
    const result = spawnSync(
      "/opt/homebrew/bin/supabase",
      ["secrets", "list", "--project-ref", ref, "-o", "json"],
      { encoding: "utf8" },
    );
    if (result.status !== 0)
      throw new Error("Could not inspect project secrets");
    console.log(
      JSON.stringify({
        usdaConfigured: result.stdout.includes("USDA_API_KEY"),
      }),
    );
    const db = await connect();
    try {
      console.log(
        (
          await db.query(
            "select to_regclass('public.nutrition_reviews') is not null as installed, to_regclass('public.menu_items') is not null as menu_exists",
          )
        ).rows[0],
      );
    } finally {
      await db.end();
    }
    return;
  }
  const db = await connect();
  try {
    const existing = await db.query(
      "select 1 from public.schema_migrations where version=$1",
      [migration],
    );
    if (!existing.rowCount)
      await db.query(
        fs.readFileSync(`supabase/migrations/${migration}`, "utf8"),
      );
    console.log("Nutrition migration installed.");
    console.log(
      (
        await db.query(
          "select status,count(*)::int from public.nutrition_reviews group by status",
        )
      ).rows,
    );
  } finally {
    await db.end();
  }
  const usdaKey =
    process.env.USDA_API_KEY ?? process.env.EXPO_PUBLIC_USDA_FDC_KEY;
  if (usdaKey && usdaKey !== "DEMO_KEY") {
    const check = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaKey)}&query=rice&pageSize=1`,
    ).catch(() => { throw new Error('USDA key validation could not reach USDA.'); });
    if (!check.ok)
      throw new Error(`USDA key validation failed: HTTP ${check.status}`);
    const secret = spawnSync(
      "/opt/homebrew/bin/supabase",
      ["secrets", "set", "--project-ref", ref, "--env-file", "/dev/stdin"],
      { input: `USDA_API_KEY=${usdaKey}\n`, encoding: "utf8" },
    );
    if (secret.status !== 0)
      throw new Error("USDA secret configuration failed");
  }
  for (const name of [
    "review-nutrition",
    "sync-haverford-menu",
    "analyze-photo",
  ]) {
    const result = spawnSync(
      "/opt/homebrew/bin/supabase",
      [
        "functions",
        "deploy",
        name,
        "--project-ref",
        ref,
        "--no-verify-jwt",
        "--use-api",
      ],
      { encoding: "utf8", stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error(`Deployment failed: ${name}`);
  }
  const res = await fetch(`${url}/functions/v1/review-nutrition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "batch" }),
  });
  if (res.status !== 401)
    throw new Error(
      `Expected unauthorized requests to be denied; got ${res.status}`,
    );
  console.log(
    "PASS: deployed nutrition endpoint rejects unauthenticated requests.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
