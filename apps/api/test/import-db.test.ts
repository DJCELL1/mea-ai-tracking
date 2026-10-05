import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createPool } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { foods, foodServings, foodSources, importRuns } from '../src/db/schema.js';
import { afcd } from '../src/import/sources/afcd.js';
import { myFoodData } from '../src/import/sources/myfooddata.js';
import { importFoods } from '../src/import/upsert.js';
import { DEFAULT_ROWS, makeAfcdFixture } from './fixtures/make-afcd.js';
import { makeMyFoodDataFixture } from './fixtures/make-myfooddata.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('AFCD import into Postgres', () => {
  const pool = createPool(url);
  const db = createDb(pool);

  beforeAll(async () => {
    await db.execute(sql`DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`);
    await runMigrations(db);
  });
  afterAll(() => pool.end());

  it('inserts, then updates on re-run without duplicating', async () => {
    const file = await makeAfcdFixture();
    const first = await importFoods(db, afcd, file);
    expect(first).toMatchObject({ rowsRead: 5, inserted: 3, updated: 0 });
    expect(first.skipped).toHaveLength(2);

    const changed = DEFAULT_ROWS.map((r) => [...r]);
    changed[0][3] = 'Apple, red delicious, unpeeled, raw';
    const second = await importFoods(db, afcd, await makeAfcdFixture(changed));
    expect(second).toMatchObject({ inserted: 0, updated: 3 });

    const rows = await db.select().from(foods);
    expect(rows).toHaveLength(3);
    const apple = rows.find((r) => r.sourceFoodId === 'F002258')!;
    expect(apple.name).toBe('Apple, red delicious, unpeeled, raw');
    expect(apple.energyKcal).toBe(57.1);

    const [source] = await db.select().from(foodSources).where(eq(foodSources.code, 'afcd'));
    expect(source.version).toBe('Release 3');
    const runs = await db.select().from(importRuns);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ inserted: 0, updated: 3, skipped: 2 });
    expect(runs[1].finishedAt).not.toBeNull();
  });

  it('finds foods with fuzzy (trigram) search', async () => {
    const res = await db.execute<{ name: string }>(
      // Word similarity copes with short typo'd queries against long AFCD names
      sql`SELECT name FROM foods WHERE word_similarity(${'chiken brest'}, name) >= 0.3 ORDER BY word_similarity(${'chiken brest'}, name) DESC`,
    );
    expect(res.rows[0]?.name).toBe('Chicken, breast, lean, grilled');
  });

  it('replaces imported servings on re-import but keeps ones I added', async () => {
    const file = await makeMyFoodDataFixture();
    await importFoods(db, myFoodData, file);
    const [egg] = await db.select().from(foods).where(eq(foods.sourceFoodId, '171287'));
    await db.insert(foodServings).values({ foodId: egg.id, label: '2 eggs', grams: 100 });

    await importFoods(db, myFoodData, file);
    const servings = await db.select().from(foodServings).where(eq(foodServings.foodId, egg.id));
    expect(servings.map((s) => [s.label, s.imported, s.isDefault]).sort()).toEqual([
      ['1 large', true, true],
      ['1 medium', true, false],
      ['2 eggs', false, false],
    ]);
  });
});
