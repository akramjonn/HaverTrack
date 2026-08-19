import * as fs from 'fs';
import * as path from 'path';
import { connect } from './db';

/**
 * Applies every SQL file in supabase/migrations in filename order, skipping the
 * ones already recorded in public.schema_migrations. Safe to re-run.
 *
 * Requires DATABASE_URL (see .env). Never hardcode the database password here —
 * this file is committed.
 */

const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations');

async function runMigrations() {
  const client = await connect();
  console.log('🐘 Connected to Supabase Postgres');

  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query<{ version: string }>(
    'select version from public.schema_migrations'
  );
  const applied = new Set(rows.map((r) => r.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭  ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`🚀 ${file}`);

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations (version) values ($1)', [file]);
      await client.query('commit');
      ran += 1;
    } catch (err) {
      await client.query('rollback');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }

  console.log(ran === 0 ? '\n✨ Schema already up to date' : `\n✨ Applied ${ran} migration(s)`);

  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name;
  `);

  console.log('\n📊 Tables in public schema:');
  for (const row of tables.rows) {
    console.log(`   - ${row.table_name}`);
  }

  await client.end();
}

runMigrations().catch((err) => {
  console.error('❌ Migration error:', err.message);
  process.exit(1);
});
