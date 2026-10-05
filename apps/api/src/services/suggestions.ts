import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { round } from '@mea/shared';
import type { FoodDto } from '@mea/shared';
import type { Db } from '../db/client.js';
import { foods, foodSources, logEntries } from '../db/schema.js';
import { hydrate, visibleTo } from './foods.js';

export interface ProteinSuggestion {
  food: FoodDto;
  /** Suggested amount: your usual amount, else the default serving, else 100 g. */
  grams: number;
  servingId: number | null;
  servingQty: number | null;
  proteinG: number;
  energyKcal: number;
  /** True when it comes from your own logging history. */
  fromHistory: boolean;
}

/** A food counts as high protein if ≥ 25% of its energy is protein, or ≥ 15 g per 100 g. */
const HIGH_PROTEIN = sql`(${foods.proteinG} >= 15 OR (${foods.energyKcal} > 0 AND ${foods.proteinG} * 4 / ${foods.energyKcal} >= 0.25))`;
const DENSITY = sql`(${foods.proteinG} * 4 / NULLIF(${foods.energyKcal}, 0))`;

/** Everyday AFCD foods (with a typical portion) offered when your history doesn't have enough high-protein foods yet. */
const STAPLES: { pattern: string; grams: number }[] = [
  { pattern: 'Chicken, breast, lean flesh, grilled%', grams: 150 },
  { pattern: 'Tuna, canned in brine, drained%', grams: 95 }, // small tin
  { pattern: 'Egg, chicken, whole, hard-boiled%', grams: 100 }, // 2 eggs
  { pattern: 'Yoghurt, flavoured, low fat (0.2%), intense sweetened, increased protein%', grams: 170 }, // tub
  { pattern: 'Cheese, cottage%', grams: 100 },
  { pattern: 'Beef, mince, lower fat, stir-fried%', grams: 150 },
  { pattern: 'Tofu (soy bean curd), firm%', grams: 150 },
  { pattern: 'Milk, cow, fluid, skim%', grams: 250 }, // a glass
];

export async function proteinSuggestions(db: Db, userId: number, limit = 5): Promise<ProteinSuggestion[]> {
  const usage = db
    .select({
      foodId: logEntries.foodId,
      uses: sql<number>`count(*)::int`.as('uses'),
      // The amount you usually log: the most recent entry's grams/serving
      grams: sql<number>`(array_agg(${logEntries.grams} ORDER BY ${logEntries.eatenAt} DESC))[1]`.as('grams'),
      servingId: sql<number | null>`(array_agg(${logEntries.servingId} ORDER BY ${logEntries.eatenAt} DESC))[1]`.as('serving_id'),
      servingQty: sql<number | null>`(array_agg(${logEntries.servingQty} ORDER BY ${logEntries.eatenAt} DESC))[1]`.as('serving_qty'),
    })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), sql`${logEntries.foodId} IS NOT NULL`, sql`${logEntries.eatenAt} > now() - interval '90 days'`))
    .groupBy(logEntries.foodId)
    .as('usage');

  const mine = await db
    .select({ food: foods, code: foodSources.code, uses: usage.uses, grams: usage.grams, servingId: usage.servingId, servingQty: usage.servingQty })
    .from(foods)
    .innerJoin(foodSources, eq(foodSources.id, foods.sourceId))
    .innerJoin(usage, eq(usage.foodId, foods.id))
    .where(and(isNull(foods.archivedAt), HIGH_PROTEIN))
    .orderBy(desc(usage.uses), desc(DENSITY))
    .limit(limit);

  const dtos = await hydrate(db, userId, mine);
  const out: ProteinSuggestion[] = mine.map((r, i) => {
    const grams = r.grams ?? 100;
    return {
      food: dtos[i],
      grams,
      servingId: r.servingId,
      servingQty: r.servingQty,
      proteinG: round(((r.food.proteinG ?? 0) * grams) / 100, 1),
      energyKcal: round(((r.food.energyKcal ?? 0) * grams) / 100, 0),
      fromHistory: true,
    };
  });

  if (out.length < limit) {
    const have = new Set(out.map((s) => s.food.id));
    for (const { pattern, grams: portion } of STAPLES) {
      if (out.length >= limit) break;
      const rows = await db
        .select({ food: foods, code: foodSources.code })
        .from(foods)
        .innerJoin(foodSources, eq(foodSources.id, foods.sourceId))
        .where(and(visibleTo(userId), isNull(foods.archivedAt), sql`${foods.name} ILIKE ${pattern}`, HIGH_PROTEIN))
        .orderBy(desc(DENSITY))
        .limit(1);
      if (!rows.length || have.has(rows[0].food.id)) continue;
      const [dto] = await hydrate(db, userId, rows);
      const def = dto.servings.find((s) => s.isDefault) ?? dto.servings[0];
      const grams = def?.grams ?? portion;
      have.add(dto.id);
      out.push({
        food: dto,
        grams,
        servingId: def?.id ?? null,
        servingQty: def ? 1 : null,
        proteinG: round(((dto.proteinG ?? 0) * grams) / 100, 1),
        energyKcal: round(((dto.energyKcal ?? 0) * grams) / 100, 0),
        fromHistory: false,
      });
    }
  }
  return out;
}
