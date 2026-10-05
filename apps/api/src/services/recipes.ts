import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { round, scalePer100g, sumNutrients, NUTRIENT_KEYS, type Meal, type Nutrients, type RecipeDto, type RecipeKind } from '@mea/shared';
import type { Db } from '../db/client.js';
import { foods, foodServings, foodSources, logEntries, recipeItems, recipes } from '../db/schema.js';
import { badRequest, notFound } from '../http.js';
import { ensureSource } from '../import/upsert.js';
import { hydrate } from './foods.js';
import { defaultEatenAt, logFood } from './log.js';

export interface RecipeInput {
  kind: RecipeKind;
  name: string;
  cookedWeightG?: number | null;
  servings?: number;
  notes?: string | null;
  items: { foodId: number; grams: number; meal?: Meal | null }[];
}

async function ownRecipe(db: Db, userId: number, id: number) {
  const [r] = await db.select().from(recipes).where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
  if (!r) throw notFound('Recipe not found');
  return r;
}

async function derivedFood(db: Db, recipeId: number) {
  const [f] = await db.select().from(foods).where(eq(foods.recipeId, recipeId));
  return f ?? null;
}

export async function getRecipe(db: Db, userId: number, id: number): Promise<RecipeDto> {
  const r = await ownRecipe(db, userId, id);
  const items = await db
    .select({ item: recipeItems, food: foods, code: foodSources.code })
    .from(recipeItems)
    .innerJoin(foods, eq(foods.id, recipeItems.foodId))
    .innerJoin(foodSources, eq(foodSources.id, foods.sourceId))
    .where(eq(recipeItems.recipeId, id))
    .orderBy(recipeItems.id);
  const foodDtos = await hydrate(db, userId, items.map((i) => ({ food: i.food, code: i.code })));
  const derived = r.kind === 'recipe' ? await derivedFood(db, id) : null;
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    cookedWeightG: r.cookedWeightG,
    servings: r.servings,
    notes: r.notes,
    items: items.map((i, idx) => ({ id: i.item.id, food: foodDtos[idx], grams: i.item.grams, meal: i.item.meal })),
    totals: sumNutrients(items.map((i) => scalePer100g(i.food, i.item.grams))),
    foodId: derived && !derived.archivedAt ? derived.id : null,
  };
}

export async function listRecipes(db: Db, userId: number): Promise<RecipeDto[]> {
  const rows = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.userId, userId)).orderBy(recipes.name);
  return Promise.all(rows.map((r) => getRecipe(db, userId, r.id)));
}

/** Per-100 g values of the finished dish. */
function per100g(totals: Nutrients, totalWeight: number): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) {
    const v = totals[k];
    out[k] = v == null || totalWeight <= 0 ? null : round((v / totalWeight) * 100, k === 'sodiumMg' ? 0 : 1);
  }
  return out;
}

export async function saveRecipe(db: Db, userId: number, input: RecipeInput, id?: number): Promise<RecipeDto> {
  if (!input.items.length) throw badRequest('Add at least one food');
  const foodIds = [...new Set(input.items.map((i) => i.foodId))];
  const rows = await db
    .select()
    .from(foods)
    .where(and(inArray(foods.id, foodIds), or(isNull(foods.userId), eq(foods.userId, userId))));
  if (rows.length !== foodIds.length) throw badRequest('One of the foods was not found');
  if (id != null && rows.some((f) => f.recipeId === id)) throw badRequest("A recipe can't include itself");
  const byId = new Map(rows.map((f) => [f.id, f]));

  const recipeId = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const values = {
      userId,
      kind: input.kind,
      name: input.name.trim(),
      cookedWeightG: input.cookedWeightG ?? null,
      servings: input.servings ?? 1,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    };
    let rid = id;
    if (rid == null) [{ id: rid }] = await tx.insert(recipes).values(values).returning({ id: recipes.id });
    else {
      await ownRecipe(tx, userId, rid);
      await tx.update(recipes).set(values).where(eq(recipes.id, rid));
      await tx.delete(recipeItems).where(eq(recipeItems.recipeId, rid));
    }
    await tx.insert(recipeItems).values(input.items.map((i) => ({ recipeId: rid!, foodId: i.foodId, grams: i.grams, meal: i.meal ?? null })));

    const existing = await derivedFood(tx, rid!);
    if (input.kind === 'recipe') {
      const totals = sumNutrients(input.items.map((i) => scalePer100g(byId.get(i.foodId)!, i.grams)));
      const rawWeight = input.items.reduce((s, i) => s + i.grams, 0);
      const totalWeight = input.cookedWeightG || rawWeight;
      const nutrients = per100g(totals, totalWeight);
      let foodId = existing?.id;
      if (existing) {
        await tx.update(foods).set({ name: values.name, description: values.notes, ...nutrients, archivedAt: null, updatedAt: new Date() }).where(eq(foods.id, existing.id));
      } else {
        const sourceId = await ensureSource(tx, 'recipe', 'My recipes', null);
        [{ id: foodId }] = await tx
          .insert(foods)
          .values({ sourceId, userId, recipeId: rid!, name: values.name, description: values.notes, ...nutrients })
          .returning({ id: foods.id });
      }
      // The "1 serving" size is managed by the recipe
      await tx.delete(foodServings).where(and(eq(foodServings.foodId, foodId!), eq(foodServings.imported, true)));
      await tx.insert(foodServings).values({
        foodId: foodId!,
        label: values.servings === 1 ? 'whole recipe' : `1 serving (1/${round(values.servings, 1)})`,
        grams: round(totalWeight / values.servings, 1),
        isDefault: true,
        imported: true,
      });
    } else if (existing && !existing.archivedAt) {
      await tx.update(foods).set({ archivedAt: new Date() }).where(eq(foods.id, existing.id));
    }
    return rid!;
  });
  return getRecipe(db, userId, recipeId);
}

export async function deleteRecipe(db: Db, userId: number, id: number) {
  await ownRecipe(db, userId, id);
  await db.transaction(async (tx) => {
    // Keep the derived food (archived) so past log entries and other recipes still resolve
    await tx.update(foods).set({ recipeId: null, archivedAt: new Date() }).where(eq(foods.recipeId, id));
    await tx.delete(recipes).where(eq(recipes.id, id));
  });
}

/**
 * Log a saved meal (each item as its own entry) or a recipe (one entry of
 * `servings` × its serving size) in one tap.
 */
export async function logRecipe(db: Db, userId: number, timeZone: string, id: number, date: string, meal: Meal, servings = 1) {
  const r = await getRecipe(db, userId, id);
  if (r.kind === 'recipe') {
    if (!r.foodId) throw badRequest('Recipe has no food yet; save it again');
    const serving = (await db.select().from(foodServings).where(and(eq(foodServings.foodId, r.foodId), eq(foodServings.imported, true))))[0];
    return [await logFood(db, userId, timeZone, { date, meal, foodId: r.foodId, servingId: serving?.id, servingQty: servings, grams: serving ? undefined : 100 })];
  }
  const eatenAt = defaultEatenAt(date, meal, timeZone);
  const rows = await db
    .insert(logEntries)
    .values(
      r.items.map((i) => ({
        userId,
        logDate: date,
        meal: i.meal ?? meal,
        eatenAt,
        foodId: i.food.id,
        name: i.food.name,
        grams: i.grams,
        entryType: 'copied' as const,
        ...scalePer100g(i.food, i.grams),
      })),
    )
    .returning({ id: logEntries.id });
  return rows;
}
