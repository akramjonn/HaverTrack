import { parseCandidate } from "./nutrition.ts";

export async function lookupUsda(query: string) {
  const key = Deno.env.get("USDA_API_KEY");
  if (!key)
    throw new Error(
      "USDA_API_KEY is not configured. Add it to Edge Function secrets.",
    );
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize: 6,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
      }),
      signal: AbortSignal.timeout(8000),
    },
  ).catch(() => { throw new Error('USDA could not be reached. Retry the lookup later.'); });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "USDA rate limit reached; retry later."
        : `USDA returned HTTP ${response.status}`,
    );
  const body = await response.json();
  return (body.foods ?? []).map(parseCandidate);
}

export async function checkNutritionBatch(database: any) {
  if (!Deno.env.get("USDA_API_KEY"))
    return { checked: 0, error: "USDA_API_KEY is not configured" };
  // Only unchecked versions are picked up. Failed lookups remain visible for manual retry.
  const { data, error } = await database
    .from("nutrition_reviews")
    .select("source_key,source")
    .is("checked_at", null)
    .eq("status", "pending")
    .limit(8);
  if (error) throw error;
  const results = await Promise.all(
    (data ?? []).map(async (row: any) => {
      try {
        const candidates = await lookupUsda(row.source.dish_name);
        const { error } = await database
          .from("nutrition_reviews")
          .update({
            candidates,
            checked_at: new Date().toISOString(),
            lookup_error: null,
          })
          .eq("source_key", row.source_key)
          .eq("status", "pending");
        if (error) throw error;
        return true;
      } catch (error) {
        const { error: saveError } = await database
          .from("nutrition_reviews")
          .update({
            checked_at: new Date().toISOString(),
            lookup_error:
              error instanceof Error ? error.message : "USDA lookup failed",
          })
          .eq("source_key", row.source_key)
          .eq("status", "pending");
        if (saveError) throw saveError;
        return false;
      }
    }),
  );
  return {
    checked: results.filter(Boolean).length,
    failed: results.filter((x) => !x).length,
  };
}
