import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { FoodDto, FoodSearchResponse } from '@mea/shared';
import type { Db } from '../db/client.js';
import { foods, foodSources, logEntries } from '../db/schema.js';
import { hydrate, visibleTo } from './foods.js';

const USAGE_DAYS = 120;

function usageSubquery(db: Db, userId: number) {
  return db
    .select({
      foodId: logEntries.foodId,
      uses: sql<number>`count(*)::int`.as('uses'),
      lastUsed: sql<Date>`max(${logEntries.eatenAt})`.as('last_used'),
    })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), sql`${logEntries.foodId} IS NOT NULL`, sql`${logEntries.eatenAt} > now() - make_interval(days => ${USAGE_DAYS})`))
    .groupBy(logEntries.foodId)
    .as('usage');
}

export function tokenise(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Fuzzy search ranked by: trigram word similarity, every word matching, prefix match,
 * the query being the food's leading name part,
 * how often/recently you've logged it, your own foods first, and shorter names.
 */
export async function searchFoods(db: Db, userId: number, rawQuery: string, limit = 30): Promise<FoodSearchResponse> {
  const query = rawQuery.trim().slice(0, 100);
  const usage = usageSubquery(db, userId);
  const base = and(visibleTo(userId), isNull(foods.archivedAt));

  if (!query) {
    const select = () =>
      db
        .select({ food: foods, code: foodSources.code, uses: usage.uses, lastUsed: usage.lastUsed })
        .from(foods)
        .innerJoin(foodSources, eq(foodSources.id, foods.sourceId))
        .innerJoin(usage, eq(usage.foodId, foods.id))
        .where(base);
    const [recent, frequent] = await Promise.all([
      select().orderBy(sql`${usage.lastUsed} DESC`).limit(12),
      select().orderBy(sql`${usage.uses} DESC`, sql`${usage.lastUsed} DESC`).limit(12),
    ]);
    return { query, results: [], recent: await hydrate(db, userId, recent), frequent: await hydrate(db, userId, frequent) };
  }

  const tokens = tokenise(query);
  const allTokens: SQL = tokens.length
    ? sql.join(tokens.map((t) => sql`${foods.name} ILIKE ${'%' + escapeLike(t) + '%'}`), sql` AND `)
    : sql`${foods.name} ILIKE ${'%' + escapeLike(query) + '%'}`;
  const sim = sql`word_similarity(${query}, ${foods.name})`;
  const score = sql<number>`(
      ${sim}
      + CASE WHEN ${allTokens} THEN 0.35 ELSE 0 END
      + CASE WHEN ${foods.name} ILIKE ${escapeLike(query) + '%'} THEN 0.25 ELSE 0 END
      -- AFCD names lead with the food ("Banana, cavendish, …"), so an exact first part is the plain food
      + CASE WHEN lower(trim(split_part(${foods.name}, ',', 1))) = ${query.toLowerCase()} THEN 0.3 ELSE 0 END
      + LEAST(coalesce(${usage.uses}, 0), 20) * 0.04
      + CASE WHEN ${usage.lastUsed} > now() - interval '7 days' THEN 0.2 ELSE 0 END
      + CASE WHEN ${foods.userId} IS NOT NULL THEN 0.15 ELSE 0 END
      - LEAST(length(${foods.name}), 120) / 600.0
    )`;

  const rows = await db
    .select({ food: foods, code: foodSources.code, uses: usage.uses, score })
    .from(foods)
    .innerJoin(foodSources, eq(foodSources.id, foods.sourceId))
    .leftJoin(usage, eq(usage.foodId, foods.id))
    .where(and(base, sql`(${sim} >= 0.3 OR (${allTokens}))`))
    .orderBy(sql`${score} DESC`, foods.name)
    .limit(limit);

  const results: FoodDto[] = await hydrate(
    db,
    userId,
    rows.map((r) => ({ ...r, uses: r.uses ?? 0 })),
  );
  return { query, results };
}
