import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

/** Loads .env into process.env without overwriting anything already set (CI wins). */
export function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parses a Postgres URL by hand. Supabase passwords routinely contain `@` and `#`,
 * which the standard URL parser splits on — producing a "password authentication
 * failed for user postgres" that looks like a wrong password rather than a
 * malformed URL. Splitting on the *last* `@` avoids that.
 */
export function pgConfigFromUrl(url: string) {
  const withoutScheme = url.replace(/^postgres(ql)?:\/\//, '');
  const separator = withoutScheme.lastIndexOf('@');
  if (separator === -1) throw new Error('DATABASE_URL is missing its credentials');

  const userInfo = withoutScheme.slice(0, separator);
  const rest = withoutScheme.slice(separator + 1);

  const colon = userInfo.indexOf(':');
  const user = safeDecode(colon === -1 ? userInfo : userInfo.slice(0, colon));
  const password = colon === -1 ? undefined : safeDecode(userInfo.slice(colon + 1));

  const slash = rest.indexOf('/');
  const hostPort = slash === -1 ? rest : rest.slice(0, slash);
  const database = (slash === -1 ? 'postgres' : rest.slice(slash + 1)).split('?')[0] || 'postgres';

  const [host, port] = hostPort.split(':');

  return {
    user,
    password,
    host,
    port: port ? Number(port) : 5432,
    database,
    ssl: { rejectUnauthorized: false },
  };
}

/** Connected pg client built from DATABASE_URL. Caller is responsible for `end()`. */
export async function connect(): Promise<Client> {
  loadEnv();

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env (local) or the repository secrets (CI).'
    );
  }

  const client = new Client(pgConfigFromUrl(url));
  await client.connect();
  return client;
}
