import { z } from 'zod';

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  serving_size?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const OpenFoodFactsProductSchema = z.object({
  product_name: z.string().optional().default('Packaged Item'),
  brands: z.string().optional(),
  serving_size: z.string().optional(),
  nutriments: z
    .object({
      'energy-kcal_serving': z.number().optional(),
      'energy-kcal_100g': z.number().optional(),
      'energy-kcal': z.number().optional(),
      proteins_serving: z.number().optional(),
      proteins_100g: z.number().optional(),
      carbohydrates_serving: z.number().optional(),
      carbohydrates_100g: z.number().optional(),
      fat_serving: z.number().optional(),
      fat_100g: z.number().optional(),
    })
    .optional(),
});

/**
 * Resolves a barcode using OpenFoodFacts API v2.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const cleanCode = barcode.trim();
  if (!cleanCode) return null;

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`, {
      headers: {
        'User-Agent': 'SquirrelTrack/1.0 (Haverford College student project)',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const product = OpenFoodFactsProductSchema.parse(data.product);
    const n = product.nutriments || {};

    const calories = Math.round(
      n['energy-kcal_serving'] ?? n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0
    );
    const protein_g = Math.round((n.proteins_serving ?? n.proteins_100g ?? 0) * 10) / 10;
    const carbs_g = Math.round((n.carbohydrates_serving ?? n.carbohydrates_100g ?? 0) * 10) / 10;
    const fat_g = Math.round((n.fat_serving ?? n.fat_100g ?? 0) * 10) / 10;

    return {
      barcode: cleanCode,
      name: product.product_name || 'Packaged Snack',
      brand: product.brands,
      serving_size: product.serving_size || '1 package',
      calories,
      protein_g,
      carbs_g,
      fat_g,
    };
  } catch (err) {
    console.warn('OpenFoodFacts lookup error:', err);
    return null;
  }
}
