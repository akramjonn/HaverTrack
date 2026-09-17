import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { checkNutritionBatch, lookupUsda } from "../_shared/usda.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    );
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user)
      return json({ error: "Sign in required" }, 401);
    const { error: permissionError } = await userClient.rpc("admin_require");
    if (permissionError)
      return json({ error: "Administrator access required" }, 403);
    const database = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const body = await request.json();
    if (body.action === "batch")
      return json(await checkNutritionBatch(database));
    if (
      typeof body.source_key !== "string" ||
      typeof body.query !== "string" ||
      body.query.trim().length < 2 ||
      body.query.length > 200
    )
      return json(
        { error: "A food version and search phrase are required" },
        400,
      );
    const { data: row, error } = await database
      .from("nutrition_reviews")
      .select("status")
      .eq("source_key", body.source_key)
      .single();
    if (error || !row) return json({ error: "Food version not found" }, 404);
    if (row.status === "approved")
      return json({ error: "This version is already published" }, 409);
    const candidates = await lookupUsda(body.query.trim());
    const { error: saveError } = await database
      .from("nutrition_reviews")
      .update({
        candidates,
        checked_at: new Date().toISOString(),
        lookup_error: null,
      })
      .eq("source_key", body.source_key)
      .eq("status", "pending");
    if (saveError) throw saveError;
    return json({ candidates });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Nutrition check failed",
      },
      400,
    );
  }
});
