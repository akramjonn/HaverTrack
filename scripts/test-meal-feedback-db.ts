import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Dedicated disposable Postgres only. Never reads production DATABASE_URL.
const port = Number(process.env.MEAL_TEST_PORT ?? 55439);
if (port === 5432) throw new Error("Use a dedicated test port.");
const root = new Client({ host: "127.0.0.1", port, database: "postgres" });
const dbName = `meal_feedback_test_${Date.now()}`;
async function main() {
  await root.connect();
  await root.query(`create database ${dbName}`);
  const db = new Client({ host: "127.0.0.1", port, database: dbName });
  await db.connect();
  try {
    await db.query(`
      do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end$$;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}',email_confirmed_at timestamptz,created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      create table public.schema_migrations(version text primary key,applied_at timestamptz default now());
      alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
    `);
    const dir = path.join(process.cwd(), "supabase/migrations");
    for (const file of fs
      .readdirSync(dir)
      .filter(
        (f) =>
          f.endsWith(".sql") && !f.endsWith("_rating_scheduler_extensions.sql"),
      )
      .sort()) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      try {
        await db.query(sql);
      } catch (e) {
        const p = Number((e as { position?: string }).position);
        throw new Error(
          `${file}: ${(e as Error).message} near ${sql.slice(p - 100, p + 100)}`,
        );
      }
    }
    console.log(
      "PASS: application migrations load on PostgreSQL 15 (scheduler extensions are verified on Supabase)",
    );
    const a = "11111111-1111-4111-8111-111111111111",
      b = "22222222-2222-4222-8222-222222222222",
      admin = "33333333-3333-4333-8333-333333333333";
    await db.query(
      `insert into auth.users(id,email,email_confirmed_at) values($1,'meal-test-a@haverford.edu',now()),($2,'meal-test-b@haverford.edu',now()),($3,'meal-test-admin@haverford.edu',now())`,
      [a, b, admin],
    );
    await db.query(`update public.profiles set role='admin' where id=$1`, [
      admin,
    ]);
    const login = async (id: string, role = "authenticated") => {
      await db.query("reset role");
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        id,
      ]);
      await db.query(`set role ${role}`);
    };
    const denied = async (sql: string, params: unknown[] = []) => {
      let failed = false;
      try {
        await db.query(sql, params);
      } catch {
        failed = true;
      }
      assert.ok(failed, `Expected rejection: ${sql}`);
    };
    await login(a);
    const payload = {
      client_uuid: "44444444-4444-4444-8444-444444444444",
      title: "Test plate",
      logged_date: new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      meal_period: "dinner",
      source: "menu",
      eaten_at: new Date(Date.now() - 7200000).toISOString(),
      guided: true,
      journey_id: "55555555-5555-4555-8555-555555555555",
      items: [
        {
          id: "main",
          name: "Tofu bowl",
          portion: 1,
          portion_unit: "serving",
          calories: 400,
          protein_g: 25,
          carbs_g: 40,
          fat_g: 10,
          course: "main",
        },
        {
          id: "side",
          name: "Rice",
          portion: 1,
          portion_unit: "serving",
          calories: 100,
          protein_g: 3,
          carbs_g: 20,
          fat_g: 1,
          course: "side",
        },
      ],
    };
    const save = async (p: unknown) =>
      (
        await db.query("select public.save_meal($1::jsonb) meal", [
          JSON.stringify(p),
        ])
      ).rows[0].meal;
    const meal = await save(payload);
    const repeated = await save(payload);
    assert.equal(meal.id, repeated.id);
    assert.equal(meal.total_calories, 500);
    const mainId = meal.meal_log_items.find(
      (i: { client_item_id: string }) => i.client_item_id === "main",
    ).id;
    assert.equal(
      mainId,
      repeated.meal_log_items.find(
        (i: { client_item_id: string }) => i.client_item_id === "main",
      ).id,
    );
    await db.query(
      `select public.submit_meal_rating($1,4,'Nice meal',array['Taste'],$2)`,
      [meal.id, JSON.stringify([{ id: mainId, stars: 5 }])],
    );
    const edited = await save({
      ...payload,
      items: payload.items.map((i) => ({
        ...i,
        portion: 2,
        calories: i.calories * 2,
      })),
    });
    assert.equal(edited.total_calories, 1000);
    assert.equal(
      (
        await db.query(
          "select stars from public.dish_ratings where meal_log_item_id=$1",
          [mainId],
        )
      ).rows[0].stars,
      5,
    );
    await denied("select public.submit_meal_rating($1,6)", [meal.id]);
    await denied("select public.save_meal($1)", [
      JSON.stringify({
        ...payload,
        items: [
          ...payload.items,
          { ...payload.items[0], id: "bad", portion: -1 },
        ],
      }),
    ]);
    assert.equal(
      (
        await db.query(
          "select total_calories from public.meal_logs where id=$1",
          [meal.id],
        )
      ).rows[0].total_calories,
      1000,
    );
    await denied("select public.admin_food_report()");
    await denied("select public.claim_rating_reminders()");
    await denied("select * from private.push_devices");
    console.log(
      "PASS: atomic saves, replay identity, retained ratings, validation, worker/admin denial",
    );
    await login(b);
    assert.equal(
      (await db.query("select * from public.meal_logs where id=$1", [meal.id]))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.meal_ratings")).rows.length,
      0,
    );
    await denied("select public.submit_meal_rating($1,3)", [meal.id]);
    await denied(`select public.rating_reminder_action($1,'dismiss')`, [
      meal.id,
    ]);
    await login(admin);
    const report = (await db.query("select public.admin_food_report() report"))
      .rows[0].report;
    assert.equal(report.meals, 1);
    assert.equal(report.ratings, 1);
    assert.equal(Number(report.average), 4);
    assert.equal(
      report.dishes.find((d: { name: string }) => d.name === "Tofu bowl")
        .average,
      5,
    );
    assert.equal(
      report.dishes.find((d: { name: string }) => d.name === "Rice").average,
      null,
    );
    const feed = (await db.query("select public.admin_feedback() feed")).rows[0]
      .feed;
    assert.equal(feed.total, 1);
    assert.equal(feed.rows[0].user_id, undefined);
    console.log("PASS: cross-user isolation and exact meal/dish analytics");
    await login(a);
    const second = await save({
      ...payload,
      client_uuid: "66666666-6666-4666-8666-666666666666",
    });
    assert.equal(
      (await db.query("select public.pending_meal_rating() meal")).rows[0].meal
        .id,
      second.id,
    );
    await login(b);
    assert.equal(
      (await db.query("select public.pending_meal_rating() meal")).rows[0].meal,
      null,
    );
    await login(a);
    await db.query("select public.rating_reminder_action($1,'snooze')", [
      second.id,
    ]);
    assert.equal(
      (await db.query("select public.pending_meal_rating() meal")).rows[0].meal,
      null,
    );
    await db.query("reset role");
    await db.query(
      "update private.rating_reminders set due_at=now()-interval '1 minute' where meal_log_id=$1",
      [second.id],
    );
    await login(a);
    console.log("PASS: in-app prompts are owner-scoped and respect snoozes");
    await db.query(
      `select public.register_rating_device('ExpoPushToken[test_token]','ios')`,
    );
    await db.query(
      `insert into public.notification_preferences(user_id,enabled,quiet_start,quiet_end) values($1,true,0,0)`,
      [a],
    );
    await login("", "service_role");
    const jobs = (await db.query("select public.claim_rating_reminders() jobs"))
      .rows[0].jobs;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].meal_log_id, second.id);
    assert.equal(
      (await db.query("select public.claim_rating_reminders() jobs")).rows[0]
        .jobs.length,
      0,
    );
    assert.equal(
      (
        await db.query("select public.begin_rating_dispatch($1) ok", [
          jobs[0].id,
        ])
      ).rows[0].ok,
      true,
    );
    await db.query(
      `select public.finish_rating_dispatch($1,'accepted','test-receipt')`,
      [jobs[0].id],
    );
    await login(a);
    await db.query(`select public.rating_reminder_action($1,'dismiss')`, [
      second.id,
    ]);
    await db.query(`delete from public.meal_logs where id=$1`, [meal.id]);
    assert.equal(
      (await db.query("select * from public.dish_ratings")).rows.length,
      0,
    );
    console.log(
      "PASS: reminder eligibility, exclusive claims, dispatch lifecycle, deletion cascades",
    );
    await db.query("reset role");
    const secrets = (
      await db.query(
        `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')`,
      )
    ).rows;
    assert.equal(secrets.length, 0);
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname in ('claim_rating_reminders','begin_rating_dispatch','finish_rating_dispatch','rating_receipts_due','pending_meal_rating')",
        )
      ).rows[0].n,
      0,
    );
    console.log("PASS: no anonymous access to elevated private functions");
  } finally {
    await db.end();
    await root.query(`drop database ${dbName}`);
    await root.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
