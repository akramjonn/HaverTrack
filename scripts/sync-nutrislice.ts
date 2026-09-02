import * as fs from 'fs';
import * as path from 'path';
import {
  NutrisliceWeekResponseSchema,
  parseNutrisliceWeek,
  ParsedMenuItem,
} from '../src/lib/nutrislice';
import { connect } from './db';

const HAVERFORD_API_BASE = 'https://haverfordcollege.api.nutrislice.com/menu/api';
const SCHOOL_SLUG = 'dining-location';

const MEAL_TYPES: { slug: 'breakfast' | 'lunch' | 'dinner' | 'brunch'; id: number }[] = [
  { slug: 'breakfast', id: 35467 },
  { slug: 'lunch', id: 35468 },
  { slug: 'dinner', id: 37406 },
  { slug: 'brunch', id: 38679 },
];

/** Keep every multi-row statement comfortably below Postgres's bind limit. */
const UPSERT_CHUNK_ROWS = 200;
const COLUMNS_PER_ROW = 17;

/** Retry transient Nutrislice/CDN failures before giving up on a meal period. */
async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);
      // Retrying a 4xx cannot fix a retired slug or menu-type id.
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < attempts) {
      const backoffMs = 1000 * attempt;
      console.warn(
        `   ↻ Attempt ${attempt}/${attempts} failed (${lastError}); retrying in ${backoffMs}ms`
      );
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
  const syncedScopes = new Map<
    string,
    { servedDate: string; mealPeriod: ParsedMenuItem['meal_period'] }
  >();
  const failures: string[] = [];

  for (const meal of MEAL_TYPES) {
    const url = `${HAVERFORD_API_BASE}/weeks/school/${SCHOOL_SLUG}/menu-type/${meal.slug}/${year}/${month}/${day}/?format=json`;
    console.log(`\nFetching ${meal.slug} menu from: ${url}`);

    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        failures.push(`${meal.slug}: HTTP ${res.status} from Nutrislice`);
        console.error(`❌ Failed to fetch ${meal.slug}: HTTP ${res.status}`);
        continue;
      }

      const json = NutrisliceWeekResponseSchema.parse(await res.json());
      const items = parseNutrisliceWeek(json, meal.slug, SCHOOL_SLUG);
      const dayCount = json.days.length;

      // Zero items can be legitimate (for example weekday brunch), while a
      // response without days indicates an upstream payload change.
      if (dayCount === 0) {
        failures.push(
          `${meal.slug}: response contained no days[] — Nutrislice payload shape may have changed`
        );
        console.error(`❌ ${meal.slug}: response had no days[] at all`);
        continue;
      }

      if (items.length === 0) {
        console.log(
          `ℹ️ Parsed 0 items for ${meal.slug} (${dayCount} days present — no menu published)`
        );
      } else {
        console.log(`✅ Parsed ${items.length} items for ${meal.slug}`);
      }

      // Track every returned day, including empty menus. This lets the database
      // reconciliation remove dishes that Nutrislice deleted after an earlier
      // sync without accidentally touching dates outside this response.
      for (const menuDay of json.days) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(menuDay.date)) {
          throw new Error(`${meal.slug}: invalid menu date ${menuDay.date}`);
        }
        syncedScopes.set(`${menuDay.date}|${meal.slug}`, {
          servedDate: menuDay.date,
          mealPeriod: meal.slug,
        });
      }

      allParsedItems.push(...items);
    } catch (err) {
      failures.push(`${meal.slug}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`❌ Error fetching/parsing ${meal.slug}:`, err);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Nutrislice sync failed for ${failures.length} meal period(s):\n  - ${failures.join('\n  - ')}`
    );
  }

  if (allParsedItems.length === 0) {
    throw new Error(
      'All meal periods returned 0 items. Refusing to overwrite the cached menu with an empty one.'
    );
  }

  // Nutrislice sometimes lists one dish at multiple stations. A multi-row
  // ON CONFLICT statement may not affect the same key twice, so retain the last
  // row for each unique database key before batching.
  const deduped = new Map<string, ParsedMenuItem>();
  for (const item of allParsedItems) {
    deduped.set(`${item.nutrislice_id}|${item.meal_period}|${item.served_date}`, item);
  }
  const rows = [...deduped.values()];

  if (rows.length < allParsedItems.length) {
    console.log(
      `🧹 Collapsed ${allParsedItems.length - rows.length} duplicate menu key(s) before upsert`
    );
  }

  console.log('\n🚀 Upserting into live Supabase Postgres database...');
  const client = await connect();

  try {
    // Keep the transaction limited to database work; all network fetches and
    // parsing completed before it began.
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO dining_locations (id, nutrislice_id, name, timezone)
      VALUES ('dining-location', 64087, 'Haverford DC', 'America/New_York')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, nutrislice_id = EXCLUDED.nutrislice_id;
    `);

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
          station_id = EXCLUDED.station_id,
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

    const scopes = [...syncedScopes.values()];
    const staleRows = await client.query(
      `
        DELETE FROM menu_items AS existing
        WHERE existing.location_id = $1
          AND EXISTS (
            SELECT 1
            FROM unnest($2::date[], $3::text[])
              AS scope(served_date, meal_period)
            WHERE scope.served_date = existing.served_date
              AND scope.meal_period = existing.meal_period
          )
          AND NOT EXISTS (
            SELECT 1
            FROM unnest($4::integer[], $5::date[], $6::text[])
              AS incoming(nutrislice_id, served_date, meal_period)
            WHERE incoming.nutrislice_id = existing.nutrislice_id
              AND incoming.served_date = existing.served_date
              AND incoming.meal_period = existing.meal_period
          );
      `,
      [
        SCHOOL_SLUG,
        scopes.map((scope) => scope.servedDate),
        scopes.map((scope) => scope.mealPeriod),
        rows.map((item) => item.nutrislice_id),
        rows.map((item) => item.served_date),
        rows.map((item) => item.meal_period),
      ]
    );

    await client.query('COMMIT');
    console.log(
      `🎉 SUCCESS: Upserted ${upsertedCount} live dishes directly into Supabase Postgres database!`
    );
    console.log(`🧹 Removed ${staleRows.rowCount ?? 0} stale menu row(s)`);

    // Publish the bundled cache only after the database write commits. A failed
    // upsert must not leave a fresh-looking cache or a misleading sync commit.
    const cacheDir = path.join(__dirname, '../src/data/menus');
    const cachePath = path.join(cacheDir, 'latest.json');
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
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }

  console.log('\n✨ Nutrislice menu sync pipeline completed.');
}

syncMenu().catch((err) => {
  console.error('\n💥 Fatal sync error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
