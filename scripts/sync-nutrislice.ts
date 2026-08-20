import * as fs from 'fs';
import * as path from 'path';
import { parseNutrisliceWeek, ParsedMenuItem } from '../src/lib/nutrislice';
import { connect } from './db';

const HAVERFORD_API_BASE = 'https://haverfordcollege.api.nutrislice.com/menu/api';
const SCHOOL_SLUG = 'dining-location';

const MEAL_TYPES: Array<{ slug: 'breakfast' | 'lunch' | 'dinner' | 'brunch'; id: number }> = [
  { slug: 'breakfast', id: 35467 },
  { slug: 'lunch', id: 35468 },
  { slug: 'dinner', id: 37406 },
  { slug: 'brunch', id: 38679 },
];

/**
 * Postgres caps a statement at 65535 bind parameters. At 17 columns per row that
 * is ~3855 rows, but we stay far below it so a single oversized week can never
 * push a chunk over the limit and turn a good sync into a hard failure.
 */
const UPSERT_CHUNK_ROWS = 200;
const COLUMNS_PER_ROW = 17;

/**
 * Nutrislice occasionally serves a transient 502/504 from its CDN. A sync that
 * dies on one blip would leave the app on a stale menu for a whole 8-hour cron
 * gap, so retry a few times before treating the meal period as genuinely broken.
 */
async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);
      // 4xx means we asked for something wrong (bad slug / retired menu-type id);
      // retrying cannot fix that, so surface it immediately instead of stalling.
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < attempts) {
      const backoffMs = 1000 * attempt;
      console.warn(`   ↻ Attempt ${attempt}/${attempts} failed (${lastError}); retrying in ${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function syncMenu() {
  console.log('🥜 Starting Nutrislice Sync for Haverford College DC...');

  // Current Eastern Time date calculation (§7 anti-pattern avoidance)
  const now = new Date();
  const easternFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = easternFormatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value || `${now.getFullYear()}`;
  const month = parts.find((p) => p.type === 'month')?.value || `${now.getMonth() + 1}`.padStart(2, '0');
  const day = parts.find((p) => p.type === 'day')?.value || `${now.getDate()}`.padStart(2, '0');

  console.log(`📅 Eastern Time Date: ${year}-${month}-${day}`);

  const allParsedItems: ParsedMenuItem[] = [];

  /**
   * Collected instead of thrown so one broken meal period does not hide the state
   * of the other three — we want the whole picture in the log before exiting.
   * A non-empty list at the end fails the job.
   */
  const failures: string[] = [];

  for (const meal of MEAL_TYPES) {
    const url = `${HAVERFORD_API_BASE}/weeks/school/${SCHOOL_SLUG}/menu-type/${meal.slug}/${year}/${month}/${day}/?format=json`;
    console.log(`\nFetching ${meal.slug} menu from: ${url}`);

    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        // Previously this was `continue`, which let a 404 from a renamed school
        // slug or a retired menu-type id look exactly like a quiet weekday.
        failures.push(`${meal.slug}: HTTP ${res.status} from Nutrislice`);
        console.error(`❌ Failed to fetch ${meal.slug}: HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const items = parseNutrisliceWeek(json, meal.slug, SCHOOL_SLUG);

      /**
       * Zero items is normal (brunch has no menu on weekdays) but zero *days* is
       * not — that means the payload shape changed under us and the parser walked
       * an empty structure. This is the distinction that keeps a silently broken
       * schema from being reported as a quiet menu.
       */
      const dayCount = Array.isArray((json as { days?: unknown[] })?.days)
        ? (json as { days: unknown[] }).days.length
        : 0;

      if (dayCount === 0) {
        failures.push(`${meal.slug}: response contained no days[] — Nutrislice payload shape may have changed`);
        console.error(`❌ ${meal.slug}: response had no days[] at all`);
        continue;
      }

      if (items.length === 0) {
        console.log(`ℹ️ Parsed 0 items for ${meal.slug} (${dayCount} days present — no menu published, treating as legitimately empty)`);
      } else {
        console.log(`✅ Parsed ${items.length} items for ${meal.slug}`);
      }

      allParsedItems.push(...items);
    } catch (err) {
      failures.push(`${meal.slug}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`❌ Error fetching/parsing ${meal.slug}:`, err);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Nutrislice sync failed for ${failures.length} meal period(s):\n  - ${failures.join('\n  - ')}`);
  }

  const cacheDir = path.join(__dirname, '../src/data/menus');
  const cachePath = path.join(cacheDir, 'latest.json');

  /**
   * Guard against overwriting a good cache with an empty one. Every meal period
   * answering successfully but yielding nothing across the whole week means the
   * dining hall is closed *or* the parser broke; either way, shipping an empty
   * menu to the app is worse than serving yesterday's, so fail and keep the file.
   */
  if (allParsedItems.length === 0) {
    throw new Error(
      'All meal periods returned 0 items. Refusing to overwrite the cached menu with an empty one.'
    );
  }

  // Connect to Supabase Postgres database and upsert items
  console.log('\n🚀 Upserting into live Supabase Postgres database...');
  const client = await connect();

  try {
    // 1. Ensure Dining Location exists
    await client.query(`
      INSERT INTO dining_locations (id, nutrislice_id, name, timezone)
      VALUES ('dining-location', 64087, 'Haverford DC', 'America/New_York')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, nutrislice_id = EXCLUDED.nutrislice_id;
    `);

    /**
     * Postgres refuses a multi-row ON CONFLICT DO UPDATE that would touch the same
     * row twice ("cannot affect row a second time"). The one-round-trip-per-item
     * loop this replaces was immune because each statement saw one row; batching is
     * not, so collapse duplicate (nutrislice_id, meal_period, served_date) keys
     * first. Nutrislice does list the same dish at two stations on occasion, and
     * last-one-wins matches what the sequential loop used to leave behind.
     */
    const deduped = new Map<string, ParsedMenuItem>();
    for (const item of allParsedItems) {
      deduped.set(`${item.nutrislice_id}|${item.meal_period}|${item.served_date}`, item);
    }
    const rows = [...deduped.values()];

    if (rows.length < allParsedItems.length) {
      console.log(`🧹 Collapsed ${allParsedItems.length - rows.length} duplicate menu key(s) before upsert`);
    }

    let upsertedCount = 0;

    for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK_ROWS) {
      const chunk = rows.slice(offset, offset + UPSERT_CHUNK_ROWS);

      const valuePlaceholders = chunk
        .map(
          (_, rowIndex) =>
            `(${Array.from(
              { length: COLUMNS_PER_ROW },
              (_, col) => `$${rowIndex * COLUMNS_PER_ROW + col + 1}`
            ).join(', ')})`
        )
        .join(', ');

      const values = chunk.flatMap((item) => [
        item.nutrislice_id,
        item.location_id,
        item.meal_period,
        item.served_date,
        item.station_name,
        item.station_id,
        item.dish_name,
        item.description,
        item.ingredients,
        item.serving_size,
        item.calories,
        item.protein_g,
        item.carbs_g,
        item.fat_g,
        item.dietary_tags,
        item.allergens,
        item.synced_at,
      ]);

      await client.query(
        `
        INSERT INTO menu_items (
          nutrislice_id, location_id, meal_period, served_date,
          station_name, station_id, dish_name, description,
          ingredients, serving_size, calories, protein_g,
          carbs_g, fat_g, dietary_tags, allergens, synced_at
        ) VALUES ${valuePlaceholders}
        ON CONFLICT (nutrislice_id, meal_period, served_date)
        DO UPDATE SET
          station_name = EXCLUDED.station_name,
          dish_name = EXCLUDED.dish_name,
          description = EXCLUDED.description,
          ingredients = EXCLUDED.ingredients,
          serving_size = EXCLUDED.serving_size,
          calories = EXCLUDED.calories,
          protein_g = EXCLUDED.protein_g,
          carbs_g = EXCLUDED.carbs_g,
          fat_g = EXCLUDED.fat_g,
          dietary_tags = EXCLUDED.dietary_tags,
          allergens = EXCLUDED.allergens,
          synced_at = EXCLUDED.synced_at;
      `,
        values
      );

      upsertedCount += chunk.length;
    }

    console.log(`🎉 SUCCESS: Upserted ${upsertedCount} live dishes directly into Supabase Postgres database!`);

    /**
     * Written only after the database call succeeds, so the committed cache is
     * always a snapshot of a sync that actually landed. The old code wrote it
     * first and swallowed the upsert error, which is how a totally failed sync
     * still produced a fresh-looking latest.json.
     */
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      cachePath,
      JSON.stringify(
        { synced_at: new Date().toISOString(), item_count: rows.length, items: rows },
        null,
        2
      ),
      'utf8'
    );
    console.log(`💾 Saved ${rows.length} items to ${cachePath}`);
  } finally {
    // `finally`, not `catch` — the connection must close, but the error has to keep
    // propagating so the process exits non-zero and the workflow goes red.
    await client.end();
  }

  console.log('\n✨ Nutrislice menu sync pipeline completed.');
}

syncMenu().catch((err) => {
  console.error('\n💥 Fatal sync error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
