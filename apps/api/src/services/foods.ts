import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { NUTRIENT_KEYS, type FoodDto, type Nutrients, type ServingDto } from '@mea/shared';
import type { Db } from '../db/client.js';
import { foods, foodServings, foodSources } from '../db/schema.js';
import { notFound } from '../http.js';

type FoodRow = typeof foods.$inferSelect;

export function nutrientsOf(row: Nutrients): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) out[k] = row[k];
  return out;
}

export async function servingsFor(db: Db, foodIds: number[]): Promise<Map<number, ServingDto[]>> {
  const map = new Map<number, ServingDto[]>();
  if (!foodIds.length) return map;
  const rows = await db
    .select()
    .from(foodServings)
    .where(inArray(foodServings.foodId, foodIds))
    .orderBy(sql`${foodServings.isDefault} DESC`, foodServings.grams);
  for (const r of rows) {
    const list = map.get(r.foodId) ?? [];
    list.push({ id: r.id, label: r.label, grams: r.grams, isDefault: r.isDefault, imported: r.imported });
    map.set(r.foodId, list);
  }
  return map;
}

export function toFoodDto(row: FoodRow, sourceCode: string, userId: number, servings: ServingDto[], uses?: number): FoodDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceCode,
    isMine: row.userId === userId,
    recipeId: row.recipeId,
    servings,
    ...(uses != null ? { uses } : {}),
    ...nutrientsOf(row),
  };
}

/** Foods visible to a user: imported foods plus their own. */
export const visibleTo = (userId: number) => or(isNull(foods.userId), eq(foods.userId, userId));

export async function getFood(db: Db, userId: number, id: number, opts: { includeArchived?: boolean } = {}): Promise<FoodDto> {
  const [row] = await db
    .select({ food: foods, code: foodSources.code })
    .from(foods)
    .innerJoin(foodSources, eq(foodSources.id, foods.sourceId))
    .where(and(eq(foods.id, id), visibleTo(userId), opts.includeArchived ? undefined : isNull(foods.archivedAt)));
  if (!row) throw notFound('Food not found');
  const servings = await servingsFor(db, [id]);
  return toFoodDto(row.food, row.code, userId, servings.get(id) ?? []);
}

/** Hydrate raw food rows (with source code) into DTOs in the given order. */
export async function hydrate(db: Db, userId: number, rows: { food: FoodRow; code: string; uses?: number }[]): Promise<FoodDto[]> {
  const servings = await servingsFor(db, rows.map((r) => r.food.id));
  return rows.map((r) => toFoodDto(r.food, r.code, userId, servings.get(r.food.id) ?? [], r.uses));
}
