/** 1 kcal = 4.184 kJ (thermochemical calorie). */
export const KJ_PER_KCAL = 4.184;

export function kjToKcal(kj: number): number {
  return round(kj / KJ_PER_KCAL, 1);
}

export function kcalToKj(kcal: number): number {
  return round(kcal * KJ_PER_KCAL, 1);
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export const NUTRIENT_KEYS = [
  'energyKj',
  'energyKcal',
  'proteinG',
  'fatG',
  'carbsG',
  'sugarsG',
  'fibreG',
  'sodiumMg',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Nutrient values; null means "not measured", which is different from 0. */
export type Nutrients = Record<NutrientKey, number | null>;

/** Scale per-100 g values to an amount in grams. Nulls stay null. */
export function scalePer100g(per100g: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) {
    const v = per100g[key];
    out[key] = v == null ? null : round(v * factor, key === 'sodiumMg' ? 0 : 1);
  }
  return out;
}
