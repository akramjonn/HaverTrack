import * as fs from 'fs';
import * as path from 'path';
import { parseNutrisliceWeek } from '../src/lib/nutrislice';

console.log('🧪 Testing Nutrislice Zod Parser against Live Fixtures...\n');

const fixturesDir = path.join(__dirname, '../fixtures');

const fixtureFiles: Array<{ file: string; meal: 'breakfast' | 'lunch' | 'dinner' | 'brunch' }> = [
  { file: 'breakfast_week.json', meal: 'breakfast' },
  { file: 'lunch_week.json', meal: 'lunch' },
  { file: 'dinner_week.json', meal: 'dinner' },
  { file: 'brunch_week.json', meal: 'brunch' },
];

let totalParsed = 0;

for (const { file, meal } of fixtureFiles) {
  const filePath = path.join(fixturesDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping missing fixture: ${file}`);
    continue;
  }

  const rawJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const parsed = parseNutrisliceWeek(rawJson, meal);
  console.log(`📦 ${file} (${meal}): Parsed ${parsed.length} menu items`);

  if (parsed.length > 0) {
    const sample = parsed[0];
    console.log(`   Sample: "${sample.dish_name}" at "${sample.station_name}"`);
    console.log(`   Nutrition: ${sample.calories} kcal, ${sample.protein_g}P / ${sample.carbs_g}C / ${sample.fat_g}F`);
    console.log(`   Dietary: [${sample.dietary_tags.join(', ')}] | Allergens: [${sample.allergens.join(', ')}]`);
  }

  totalParsed += parsed.length;
}

console.log(`\n🎉 SUCCESS: Successfully parsed ${totalParsed} items from real fixtures with strict Zod validation!`);
