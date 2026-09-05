import assert from "node:assert/strict";
import { connect, loadEnv } from "./db";

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  for (const name of [
    "admin_food_report",
    "admin_feedback",
    "claim_rating_reminders",
    "pending_meal_rating",
  ]) {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.ok(
      [401, 403].includes(response.status),
      `${name} must reject anonymous access; received ${response.status}`,
    );
  }
  const worker = await fetch(`${url}/functions/v1/send-rating-reminders`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(
    worker.status,
    401,
    "Worker must reject requests without its private secret",
  );
  const db = await connect();
  try {
    const migrations = await db.query(
      `select count(*)::integer n from public.schema_migrations where version in ('20260905012411_guided_meals_feedback.sql','20260905021136_meal_feedback_compatibility.sql','20260905021342_rating_scheduler_extensions.sql','20260905023211_private_rating_worker.sql')`,
    );
    assert.equal(migrations.rows[0].n, 4);
    const policies = await db.query(
      `select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('meal_ratings','dish_ratings','notification_preferences','dish_categories','meal_flow_events')`,
    );
    assert.equal(policies.rows.length, 5);
    assert.ok(policies.rows.every((r) => r.relrowsecurity));
    const jobs = await db.query(
      `select jobname,schedule,active from cron.job where jobname='havertrack-rating-reminders'`,
    );
    assert.equal(jobs.rows.length, 1);
    assert.equal(jobs.rows[0].active, true);
    assert.equal(jobs.rows[0].schedule, "* * * * *");
    const recent = await db.query(
      `select status from cron.job_run_details where jobid=(select jobid from cron.job where jobname='havertrack-rating-reminders') order by start_time desc limit 1`,
    );
    console.log(
      "PASS: deployed migrations, RLS, anonymous API denial, worker authentication, active scheduler",
    );
    console.log(
      "Latest scheduler execution:",
      recent.rows[0]?.status ?? "awaiting first minute",
    );
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
