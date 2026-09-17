import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { connect, loadEnv } from './db';

const JOB_NAME = 'havertrack-menu-sync';
const MIGRATION = '20260917045327_scheduled_haverford_menu_sync.sql';

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error('Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL to the project URL.');
  }
  const projectRef = new URL(url).hostname.split('.')[0];
  const secret = randomBytes(32).toString('hex');

  // This repository predates Supabase CLI migration-history tracking. Apply
  // only this feature migration instead of risking a replay of every migration.
  const migrationDatabase = await connect();
  try {
    const applied = await migrationDatabase.query(
      `select 1 from public.schema_migrations where version = $1`,
      [MIGRATION],
    );
    if (!applied.rowCount) {
      const migrationSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase', 'migrations', MIGRATION),
        'utf8',
      );
      await migrationDatabase.query(migrationSql);
    }
  } finally {
    await migrationDatabase.end();
  }

  const deploy = spawnSync(
    'supabase',
    ['functions', 'deploy', 'sync-haverford-menu', '--project-ref', projectRef, '--no-verify-jwt'],
    { encoding: 'utf8', stdio: 'inherit' },
  );
  if (deploy.status !== 0) throw new Error('Edge Function deployment failed; no Cron job was installed.');

  const setSecret = spawnSync(
    'supabase',
    ['secrets', 'set', '--project-ref', projectRef, '--env-file', '/dev/stdin'],
    { input: `MENU_SYNC_SECRET=${secret}\n`, encoding: 'utf8' },
  );
  if (setSecret.status !== 0) throw new Error('Could not set MENU_SYNC_SECRET; no Cron job was installed.');

  const database = await connect();
  try {
    await database.query('begin');
    const current = await database.query(
      `select id from vault.secrets where name = 'havertrack_menu_sync_secret'`,
    );
    if (current.rows.length) {
      await database.query(`select vault.update_secret($1, $2)`, [current.rows[0].id, secret]);
    } else {
      await database.query(
        `select vault.create_secret($1, 'havertrack_menu_sync_secret', 'Authenticates the HaverTrack menu Cron job')`,
        [secret],
      );
    }
    const statement = `select net.http_post(url := '${url}/functions/v1/sync-haverford-menu', headers := jsonb_build_object('Content-Type','application/json','x-menu-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='havertrack_menu_sync_secret')), body := '{}'::jsonb, timeout_milliseconds := 55000);`;
    await database.query(`select cron.schedule($1, '*/15 * * * *', $2)`, [JOB_NAME, statement]);
    await database.query('commit');

    const verification = await fetch(`${url}/functions/v1/sync-haverford-menu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-menu-sync-secret': secret },
      body: '{}',
    });
    const body = await verification.text();
    if (!verification.ok) throw new Error(`Function verification returned HTTP ${verification.status}: ${body}`);
    console.log(`Menu sync deployed, verified, and scheduled every 15 minutes (${JOB_NAME}).`);
  } catch (error) {
    await database.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
