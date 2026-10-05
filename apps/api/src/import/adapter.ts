import type { Nutrients } from '@mea/shared';

/** One food in the shape every data source is converted to. Nutrients are per 100 g. */
export interface NormalisedFood extends Nutrients {
  sourceFoodId: string;
  name: string;
  description: string | null;
  /** Serving sizes from the source. When given, they replace this food's previously imported servings. */
  servings?: { label: string; grams: number }[];
}

export type RowResult =
  | { ok: true; rowNumber: number; food: NormalisedFood }
  | { ok: false; rowNumber: number; reason: string };

/**
 * A food data source. To add a new one (NZ FOODfiles, a product label CSV, …),
 * implement this interface in `sources/<code>.ts` and register it in `sources/index.ts`.
 * The CLI, upsert, kJ→kcal conversion and run logging are shared.
 */
export interface FoodSourceAdapter {
  /** Stable code stored in food_sources.code, e.g. 'afcd'. */
  code: string;
  /** Display name stored in food_sources.name. */
  name: string;
  /** Human-readable report of how the file will be read. Must not write anything. */
  inspect(file: string): Promise<string>;
  /** Read and convert every row. */
  read(file: string): Promise<{ version: string | null; rows: RowResult[] }>;
}
