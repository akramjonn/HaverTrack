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

  for (const meal of MEAL_TYPES) {
    const url = `${HAVERFORD_API_BASE}/weeks/school/${SCHOOL_SLUG}/menu-type/${meal.slug}/${year}/${month}/${day}/?format=json`;
    console.log(`\nFetching ${meal.slug} menu from: ${url}`);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`⚠️ Failed to fetch ${meal.slug}: HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const items = parseNutrisliceWeek(json, meal.slug, SCHOOL_SLUG);
      console.log(`✅ Parsed ${items.length} items for ${meal.slug}`);
      allParsedItems.push(...items);
    } catch (err) {
      console.error(`❌ Error parsing ${meal.slug}:`, err);
    }
  }

  // Ensure local cache directory exists
  const cacheDir = path.join(__dirname, '../src/data/menus');
  fs.mkdirSync(cacheDir, { recursive: true });

  const cachePath = path.join(cacheDir, 'latest.json');
  const cachePayload = {
    synced_at: new Date().toISOString(),
    item_count: allParsedItems.length,
    items: allParsedItems,
  };

  fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), 'utf8');
  console.log(`\n💾 Saved ${allParsedItems.length} items to ${cachePath}`);

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

    // 2. Upsert menu items
    let upsertedCount = 0;
    for (const item of allParsedItems) {
      await client.query(
        `
        INSERT INTO menu_items (
          nutrislice_id, location_id, meal_period, served_date,
          station_name, station_id, dish_name, description,
          ingredients, serving_size, calories, protein_g,
          carbs_g, fat_g, dietary_tags, allergens, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
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
        [
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
        ]
      );
      upsertedCount++;
    }

    console.log(`🎉 SUCCESS: Upserted ${upsertedCount} live dishes directly into Supabase Postgres database!`);
    await client.end();
  } catch (dbErr) {
    console.error('❌ Database upsert error:', dbErr);
  }

  console.log('\n✨ Nutrislice menu sync pipeline completed.');
}

syncMenu().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
