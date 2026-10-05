import type { Meal, Nutrients } from '@mea/shared';

export const MEAL_LABELS: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '–';
  return n.toLocaleString('en-AU', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

/** Grams: one decimal under 10 g, whole numbers above. */
export function g(n: number | null | undefined): string {
  if (n == null) return '–';
  return `${fmt(n, Math.abs(n) < 10 ? 1 : 0)} g`;
}

export function energy(n: Pick<Nutrients, 'energyKcal' | 'energyKj'>): string {
  return `${fmt(n.energyKcal)} kcal · ${fmt(n.energyKj)} kJ`;
}

/** Sensible meal for the current time of day. */
export function mealForTime(date = new Date()): Meal {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 14.5) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21.5) return 'dinner';
  return 'snack';
}

export function prettyDate(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function amountLabel(e: { grams: number | null; servingLabel: string | null; servingQty: number | null }): string {
  if (e.servingLabel && e.servingQty != null) return `${fmt(e.servingQty, 2)} × ${e.servingLabel} (${g(e.grams)})`;
  return e.grams != null ? g(e.grams) : '';
}
