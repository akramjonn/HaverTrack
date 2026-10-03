import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Pool } from 'pg';

// Dedicated disposable PostgreSQL only; never reads production DATABASE_URL.
const port = Number(process.env.SECURITY_TEST_PORT ?? 55473);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 5432) {
  throw new Error('Use a dedicated local test port.');
}
const config = { host: '127.0.0.1', port, database: 'postgres' };
const dbName = `security_test_${Date.now()}`;
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';

async function main() {
  const root = new Client(config);
  await root.connect();
  await root.query(`create database ${dbName}`);
  const db = new Client({ ...config, database: dbName });
  await db.connect();
  try {
    await db.query(`
      do $$begin
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      end$$;
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
      alter default privileges in schema public grant all on tables to service_role;
    `);
    const migrations = path.join(process.cwd(), 'supabase/migrations');
    const cacheFix = '20261003000000_security_barcode_cache.sql';
    for (const file of fs.readdirSync(migrations).filter(f => f.endsWith('.sql') && !f.endsWith('_rating_scheduler_extensions.sql')).sort()) {
      if (file === cacheFix) {
        // Reproduce a forged shared hit and a forged negative cache entry before fixing.
        await db.query('set role authenticated');
        await db.query("insert into public.barcode_cache(barcode,name,calories,source) values('012345678901','Forged',9999,'off'),('0012345678901',null,null,'miss')");
        await db.query("update public.barcode_cache set name='Forged replacement' where barcode='012345678901'");
        await db.query('reset role');
      }
      try { await db.query(fs.readFileSync(path.join(migrations, file), 'utf8')); }
      catch (error) { throw new Error(`${file}: ${(error as Error).message}`); }
    }
    assert.equal((await db.query('select count(*)::int n from public.barcode_cache')).rows[0].n, 0);
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())', [a, 'security-a@haverford.edu', b, 'security-b@haverford.edu']);
    await db.query("insert into public.barcode_cache(barcode,name,calories,source) values('012345678901','Trusted',120,'off')");
    const denied = async (sql: string, params: unknown[] = []) => {
      await assert.rejects(() => db.query(sql, params), { code: '42501' });
    };
    for (const role of ['anon', 'authenticated']) {
      await db.query(`set role ${role}`);
      await denied("insert into public.barcode_cache(barcode,source) values('new','miss')");
      await denied("insert into public.barcode_cache(barcode,source) values('012345678901','miss') on conflict(barcode) do update set source='miss'");
      await denied("update public.barcode_cache set calories=9999,name='Forged' where barcode='012345678901'");
      await denied("update public.barcode_cache set source='miss',calories=null where barcode='012345678901'");
      await denied('delete from public.barcode_cache');
      await denied('truncate public.barcode_cache');
      await denied('select public.reserve_analysis_usage($1)', [a]);
      for (const sql of [
        'select * from private.analysis_usage',
        `insert into private.analysis_usage values('${a}',current_date,1)`,
        'update private.analysis_usage set used_count=1',
        'delete from private.analysis_usage',
        'truncate private.analysis_usage',
      ]) await denied(sql);
      if (role === 'authenticated') {
        assert.equal((await db.query('select name,calories,source from public.barcode_cache')).rows[0].name, 'Trusted');
      }
      await db.query('reset role');
    }
    assert.deepEqual((await db.query('select name,calories,source from public.barcode_cache')).rows[0], { name: 'Trusted', calories: 120, source: 'off' });
    console.log('PASS: full application migrations, poisoned-hit/miss flush, client cache mutations and ledger/RPC access denied');

    // Old-day saturation must not affect the server UTC day, even with another session timezone.
    await db.query("insert into private.analysis_usage values($1,(clock_timestamp() at time zone 'UTC')::date - 1,25)", [a]);
    const pool = new Pool({ ...config, database: dbName, max: 40 });
    let results: number[];
    try {
      results = await Promise.all(Array.from({ length: 50 }, async () => {
        const client = await pool.connect();
        try {
          await client.query('set role service_role');
          await client.query("set time zone 'Pacific/Kiritimati'");
          return (await client.query('select public.reserve_analysis_usage($1) remaining', [a])).rows[0].remaining;
        } finally { client.release(); }
      }));
    } finally { await pool.end(); }
    assert.equal(results.filter(n => n >= 0).length, 25);
    assert.equal(results.filter(n => n === -1).length, 25);
    assert.deepEqual(results.filter(n => n >= 0).sort((x,y) => x-y), Array.from({length:25}, (_,i) => i));
    assert.equal((await db.query("select used_count from private.analysis_usage where user_id=$1 and usage_date=(clock_timestamp() at time zone 'UTC')::date", [a])).rows[0].used_count, 25);
    await db.query('set role service_role');
    assert.equal((await db.query('select public.reserve_analysis_usage($1) remaining', [b])).rows[0].remaining, 24);
    await db.query('reset role');

    // Client meal edits/removals are independent of provider usage.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.query('set role authenticated');
    await db.query("insert into public.meal_logs(user_id,client_uuid,title,logged_date,meal_period,source) values($1,gen_random_uuid(),'Meal',current_date,'lunch','scan')", [a]);
    await db.query("update public.meal_logs set source='manual',logged_date=current_date-1 where user_id=$1", [a]);
    await db.query('delete from public.meal_logs where user_id=$1', [a]);
    await db.query('reset role');
    await db.query('set role service_role');
    assert.equal((await db.query('select public.reserve_analysis_usage($1) remaining', [a])).rows[0].remaining, -1);
    await db.query('reset role');
    assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname='reserve_analysis_usage' and (p.prosecdef or p.pronargs<>1)")).rows[0].n, 0);
    console.log('PASS: 50 concurrent reservations allow exactly 25, UTC day/user isolation, immutable quota across meal edits and deletion');
  } finally {
    await db.end();
    await root.query(`drop database ${dbName}`);
    await root.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
