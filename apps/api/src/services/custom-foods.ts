import { and, eq } from 'drizzle-orm';
import { round, type FoodDto } from '@mea/shared';
import type { Db } from '../db/client.js';
import { foods, foodServings } from '../db/schema.js';
import { badRequest, notFound } from '../http.js';
import { ensureSource } from '../import/upsert.js';
import { getFood } from './foods.js';
import { bothEnergies } from './log.js';

export interface CustomFoodInput {
  name: string;
  description?: string | null;
  /** Nutrition labels show both; enter whichever column is easier. */
  basis: 'per100g' | 'perServing';
  servingLabel?: string;
  servingGrams?: number;
  energyKj?: number;
  energyKcal?: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  sugarsG?: number | null;
  fibreG?: number | null;
  sodiumMg?: number | null;
}

/** Convert label values to per 100 g. */
export function toPer100g(input: CustomFoodInput) {
  if (input.basis === 'perServing' && !input.servingGrams) throw badRequest('Per-serving values need the serving size in grams');
  const f = input.basis === 'perServing' ? 100 / input.servingGrams! : 1;
  const scale = (v: number | null | undefined, d = 1) => (v == null ? null : round(v * f, d));
  const energy = bothEnergies(input.energyKcal, input.energyKj);
  if (energy.energyKj == null) throw badRequest('Enter energy in kJ or kcal');
  return {
    energyKj: scale(energy.energyKj),
    energyKcal: scale(energy.energyKcal),
    proteinG: scale(input.proteinG),
    fatG: scale(input.fatG),
    carbsG: scale(input.carbsG),
    sugarsG: scale(input.sugarsG),
    fibreG: scale(input.fibreG),
    sodiumMg: scale(input.sodiumMg, 0),
  };
}

export async function createCustomFood(db: Db, userId: number, input: CustomFoodInput): Promise<FoodDto> {
  const sourceId = await ensureSource(db, 'custom', 'My foods', null);
  const per100 = toPer100g(input);
  const [row] = await db
    .insert(foods)
    .values({ sourceId, userId, name: input.name.trim(), description: input.description?.trim() || null, ...per100 })
    .returning();
  if (input.servingGrams) {
    await db.insert(foodServings).values({ foodId: row.id, label: input.servingLabel?.trim() || '1 serve', grams: input.servingGrams, isDefault: true });
  }
  return getFood(db, userId, row.id);
}

async function ownFood(db: Db, userId: number, id: number) {
  const [row] = await db.select().from(foods).where(and(eq(foods.id, id), eq(foods.userId, userId)));
  if (!row) throw notFound('Food not found (only your own foods can be changed)');
  return row;
}

export async function updateCustomFood(db: Db, userId: number, id: number, input: CustomFoodInput): Promise<FoodDto> {
  const row = await ownFood(db, userId, id);
  if (row.recipeId) throw badRequest('Edit the recipe to change this food');
  await db
    .update(foods)
    .set({ name: input.name.trim(), description: input.description?.trim() || null, ...toPer100g(input), updatedAt: new Date() })
    .where(eq(foods.id, id));
  return getFood(db, userId, id);
}

/** Archived rather than deleted so past log entries and recipes keep working. */
export async function archiveCustomFood(db: Db, userId: number, id: number) {
  const row = await ownFood(db, userId, id);
  if (row.recipeId) throw badRequest('Delete the recipe instead');
  await db.update(foods).set({ archivedAt: new Date() }).where(eq(foods.id, id));
}

export async function addServing(db: Db, userId: number, foodId: number, label: string, grams: number) {
  await getFood(db, userId, foodId); // any visible food can have servings added
  const [row] = await db.insert(foodServings).values({ foodId, label: label.trim(), grams }).returning();
  return { id: row.id, label: row.label, grams: row.grams, isDefault: row.isDefault, imported: row.imported };
}

export async function deleteServing(db: Db, userId: number, servingId: number) {
  const [s] = await db.select().from(foodServings).where(eq(foodServings.id, servingId));
  if (!s) throw notFound('Serving not found');
  await getFood(db, userId, s.foodId, { includeArchived: true });
  if (s.imported) throw badRequest('Only serving sizes you added can be deleted');
  await db.delete(foodServings).where(eq(foodServings.id, servingId));
}
