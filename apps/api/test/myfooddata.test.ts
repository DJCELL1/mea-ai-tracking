import { describe, expect, it } from 'vitest';
import { myFoodData } from '../src/import/sources/myfooddata.js';
import { partitionRows } from '../src/import/upsert.js';
import { makeMyFoodDataFixture } from './fixtures/make-myfooddata.js';

describe('MyFoodData adapter', () => {
  it('maps kcal to kJ, uses net carbs, reads servings and treats "NULL" as missing', async () => {
    const { version, rows } = await myFoodData.read(await makeMyFoodDataFixture());
    expect(version).toBe('Release 1.4');
    const { foods, skipped } = partitionRows(rows);
    expect(skipped).toEqual([]);

    expect(foods[0]).toMatchObject({
      sourceFoodId: '171287',
      name: 'Eggs Whole Raw',
      description: 'Dairy and Egg Products',
      energyKcal: 143,
      energyKj: 598.3,
      carbsG: 0.72,
      sodiumMg: 142,
      servings: [
        { label: '1 large', grams: 50 },
        { label: '1 medium', grams: 44 },
      ],
    });
    // Net-Carbs missing → carbohydrate − fibre
    expect(foods[1]).toMatchObject({ description: null, carbsG: 10.3, sodiumMg: null, servings: [] });
  });
});
