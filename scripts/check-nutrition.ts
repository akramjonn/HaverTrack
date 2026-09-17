import { connect, loadEnv } from "./db";
import { parseCandidate } from "../supabase/functions/_shared/nutrition";

// Bootstrap existing menu versions. Future versions are checked by the menu-sync worker.
async function main() {
  loadEnv();
  const key = process.env.USDA_API_KEY ?? process.env.EXPO_PUBLIC_USDA_FDC_KEY;
  if (!key || key === "DEMO_KEY")
    throw new Error("A production USDA key is required");
  const db = await connect();
  try {
    if (process.argv.includes("--sync")) {
      const secret = (
        await db.query(
          "select decrypted_secret from vault.decrypted_secrets where name='havertrack_menu_sync_secret'",
        )
      ).rows[0]?.decrypted_secret;
      if (!secret) throw new Error("Menu sync secret is not configured");
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/sync-haverford-menu`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-menu-sync-secret": secret,
          },
          body: "{}",
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!response.ok)
        throw new Error(`Menu sync returned HTTP ${response.status}`);
      console.log("PASS: live menu sync completed with nutrition checks");
    }
    const rows = (
      await db.query(
        `select r.source_key,r.source from public.nutrition_reviews r where r.checked_at is null and r.status='pending' and exists(select 1 from public.menu_items m where m.nutrition_source_key=r.source_key) order by r.source_key limit 400`,
      )
    ).rows;
    let checked = 0,
      failed = 0;
    for (let start = 0; start < rows.length; start += 8) {
      const results = await Promise.all(
        rows.slice(start, start + 8).map(async (r) => {
          let lookupError: string | null = null,
            candidates: unknown[] = [];
          try {
            const response = await fetch(
              `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  query: r.source.dish_name,
                  pageSize: 6,
                  dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
                }),
                signal: AbortSignal.timeout(10000),
              },
            ).catch(() => { throw new Error('USDA could not be reached. Retry later.'); });
            if (!response.ok) throw new Error(`USDA HTTP ${response.status}`);
            candidates = ((await response.json()).foods ?? []).map(
              parseCandidate,
            );
            checked++;
          } catch (error) {
            lookupError = (error as Error).message;
            failed++;
          }
          return { candidates, lookupError, sourceKey: r.source_key };
        }),
      );
      for (const result of results)
        await db.query(
          `update public.nutrition_reviews set candidates=$1,lookup_error=$2,checked_at=now() where source_key=$3 and status='pending' and checked_at is null`,
          [
            JSON.stringify(result.candidates),
            result.lookupError,
            result.sourceKey,
          ],
        );
      console.log(`USDA checked ${checked}/${rows.length}; failed ${failed}`);
    }
    console.log(
      (
        await db.query(
          `select count(*)::int as current_versions,count(*) filter(where checked_at is not null)::int as checked,count(*) filter(where jsonb_array_length(candidates)>0)::int as with_candidates,count(*) filter(where lookup_error is not null)::int as errors from public.nutrition_reviews r where exists(select 1 from public.menu_items m where m.nutrition_source_key=r.source_key)`,
        )
      ).rows[0],
    );
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
