import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("RATING_DISPATCH_SECRET");
  if (!secret || req.headers.get("x-dispatch-secret") !== secret)
    return json({ error: "Unauthorized" }, 401);
  if (Deno.env.get("RATING_DISPATCH_ENABLED") !== "true")
    return json({ disabled: true });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
  };
  let attempted = 0;
  try {
    const jobs = (await rpc("claim_rating_reminders")) as {
      id: string;
      meal_log_id: string;
      token: string;
    }[];
    for (const job of jobs) {
      if (!(await rpc("begin_rating_dispatch", { p_id: job.id }))) continue;
      attempted++;
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(Deno.env.get("EXPO_ACCESS_TOKEN")
              ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
              : {}),
          },
          body: JSON.stringify({
            to: job.token,
            title: "How was your meal?",
            body: "Give your meal a quick rating. Your feedback makes a difference.",
            channelId: "meal-ratings",
            ttl: 3600,
            data: { kind: "meal-rating", mealId: job.meal_log_id },
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 429 || response.status >= 500) {
          await rpc("finish_rating_dispatch", {
            p_id: job.id,
            p_status: "pending",
            p_error: `Provider HTTP ${response.status}`,
          });
          continue;
        }
        if (!response.ok) {
          await rpc("finish_rating_dispatch", {
            p_id: job.id,
            p_status: "failed",
            p_error: `Provider HTTP ${response.status}`,
          });
          continue;
        }
        const body = await response.json();
        const ticket = Array.isArray(body.data) ? body.data[0] : body.data;
        await rpc("finish_rating_dispatch", {
          p_id: job.id,
          p_status:
            ticket?.status === "ok" && ticket.id ? "accepted" : "failed",
          p_ticket: ticket?.id ?? null,
          p_error:
            ticket?.details?.error ??
            (ticket?.status === "ok" ? null : "Invalid provider response"),
        });
      } catch {
        // A network timeout can occur after acceptance. Do not risk another push.
        await rpc("finish_rating_dispatch", {
          p_id: job.id,
          p_status: "unknown",
          p_error: "Ambiguous provider response; not automatically resent",
        });
      }
    }
    const due = (await rpc("rating_receipts_due")) as {
      id: string;
      ticket_id: string;
    }[];
    if (due.length) {
      const response = await fetch(
        "https://exp.host/--/api/v2/push/getReceipts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(Deno.env.get("EXPO_ACCESS_TOKEN")
              ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
              : {}),
          },
          body: JSON.stringify({ ids: due.map((r) => r.ticket_id) }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.ok) {
        const body = await response.json();
        for (const r of due) {
          const receipt = body.data?.[r.ticket_id];
          if (receipt)
            await rpc("finish_rating_dispatch", {
              p_id: r.id,
              p_status: receipt.status === "ok" ? "delivered" : "failed",
              p_error: receipt.details?.error ?? null,
            });
        }
      }
    }
    return json({ attempted });
  } catch (e) {
    console.error(
      "Rating dispatcher failed",
      e instanceof Error ? e.message : "Database or provider error",
    );
    return json({ error: "Dispatch failed" }, 500);
  }
});
