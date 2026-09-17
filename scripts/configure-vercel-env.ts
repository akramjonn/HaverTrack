import { spawnSync } from 'node:child_process';
import { loadEnv } from './db';
loadEnv();
// Only these public client settings belong in the web build. Backend credentials stay in Supabase.
for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  const result = spawnSync('vercel', ['env', 'add', name, 'production', '--force', '--yes'], { input: value, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not configure ${name}`);
  console.log(`Configured ${name} for production`);
}
