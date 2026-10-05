import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DayLogDto, FoodDto, FoodSearchResponse, RecipeDto } from '@mea/shared';
import { foodId, setupApp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('API', () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  const D = '2026-10-05';
  beforeAll(async () => {
    ctx = await setupApp();
  });
  afterAll(() => ctx.pool.end());

  describe('auth', () => {
    it('rejects anonymous requests and wrong passwords', async () => {
      await request(ctx.app).get('/api/log?date=2026-10-05').expect(401);
      const res = await request(ctx.app).post('/api/auth/login').set(ctx.H).send({ email: 'me@example.com', password: 'nope' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Wrong email or password');
    });
    it('blocks mutating requests without the custom header (CSRF)', async () => {
      await ctx.agent.post('/api/log/quick').send({ date: D, meal: 'snack', energyKcal: 100 }).expect(403);
    });
    it('returns me with settings and today', async () => {
      const res = await ctx.agent.get('/api/auth/me').expect(200);
      expect(res.body).toMatchObject({ email: 'me@example.com', settings: { timezone: 'Australia/Sydney', windowStart: '12:00' } });
      expect(res.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('logging', () => {
    it('logs by grams and by serving, totals the day, edits and deletes', async () => {
      const chicken = await foodId(ctx.db, 'Chicken, breast, lean, grilled');
      const a = await ctx.agent.post('/api/log').set(ctx.H).send({ date: D, meal: 'lunch', foodId: chicken, grams: 150 }).expect(201);
      expect(a.body).toMatchObject({ grams: 150, energyKj: 1017, energyKcal: 243, proteinG: 46.5, entryType: 'food' });

      const serving = await ctx.agent.post(`/api/foods/${chicken}/servings`).set(ctx.H).send({ label: '1 fillet', grams: 120 }).expect(201);
      const b = await ctx.agent.post('/api/log').set(ctx.H).send({ date: D, meal: 'dinner', foodId: chicken, servingId: serving.body.id, servingQty: 2 }).expect(201);
      expect(b.body).toMatchObject({ grams: 240, servingLabel: '1 fillet', servingQty: 2, proteinG: 74.4 });

      const q = await ctx.agent.post('/api/log/quick').set(ctx.H).send({ date: D, meal: 'snack', name: 'Protein bar', energyKj: 836.8, proteinG: 20 }).expect(201);
      expect(q.body).toMatchObject({ energyKcal: 200, energyKj: 836.8, entryType: 'quick_add' });

      let day = (await ctx.agent.get(`/api/log?date=${D}`).expect(200)).body as DayLogDto;
      expect(day.entries).toHaveLength(3);
      expect(day.totals.proteinG).toBe(140.9);
      expect(day.byMeal.dinner.proteinG).toBe(74.4);
      expect(day.byMeal.breakfast.energyKcal).toBeNull();

      // Change quantity only: keeps the serving
      const edited = await ctx.agent.patch(`/api/log/${b.body.id}`).set(ctx.H).send({ servingQty: 1 }).expect(200);
      expect(edited.body).toMatchObject({ grams: 120, servingQty: 1, servingLabel: '1 fillet', proteinG: 37.2 });
      // Switch to grams and move meal
      const moved = await ctx.agent.patch(`/api/log/${b.body.id}`).set(ctx.H).send({ grams: 100, meal: 'lunch' }).expect(200);
      expect(moved.body).toMatchObject({ grams: 100, servingId: null, meal: 'lunch', proteinG: 31 });
      await ctx.agent.patch(`/api/log/${q.body.id}`).set(ctx.H).send({ energyKcal: 250 }).expect(200);

      await ctx.agent.delete(`/api/log/${a.body.id}`).set(ctx.H).expect(204);
      day = (await ctx.agent.get(`/api/log?date=${D}`).expect(200)).body;
      expect(day.entries.map((e) => e.name).sort()).toEqual(['Chicken, breast, lean, grilled', 'Protein bar']);
      expect(day.totals.energyKcal).toBe(412);
    });

    it('copies a day', async () => {
      const res = await ctx.agent.post('/api/log/copy').set(ctx.H).send({ fromDate: D, toDate: '2026-10-06' }).expect(200);
      expect(res.body.copied).toBe(2);
      const day = (await ctx.agent.get('/api/log?date=2026-10-06').expect(200)).body as DayLogDto;
      expect(day.totals.energyKcal).toBe(412);
      expect(day.entries.find((e) => e.name === 'Chicken, breast, lean, grilled')?.entryType).toBe('copied');
      // Not today, so the original local time of day is kept on the new date
      expect(new Date(day.entries[0].eatenAt).toISOString().slice(0, 10)).toMatch(/2026-10-0[56]/);
    });

    it('validates input', async () => {
      const res = await ctx.agent.post('/api/log').set(ctx.H).send({ date: '2026-02-30', meal: 'brunch', foodId: 1, grams: 10 }).expect(400);
      expect(res.body.issues.join()).toMatch(/date.*meal/s);
    });
  });

  describe('search', () => {
    it('finds typo-tolerant matches and puts frequently logged foods first', async () => {
      const res = (await ctx.agent.get('/api/foods/search?q=chiken').expect(200)).body as FoodSearchResponse;
      expect(res.results[0].name).toBe('Chicken, breast, lean, grilled');
      expect(res.results[0].servings.map((s) => s.label)).toContain('1 fillet');

      const empty = (await ctx.agent.get('/api/foods/search?q=').expect(200)).body as FoodSearchResponse;
      expect(empty.recent?.[0].name).toBe('Chicken, breast, lean, grilled');
      expect(empty.frequent?.[0].uses).toBeGreaterThan(0);
    });
  });

  describe('custom foods and recipes', () => {
    it('creates a custom food from per-serving label values', async () => {
      const res = await ctx.agent
        .post('/api/foods')
        .set(ctx.H)
        .send({ name: 'Greek yoghurt tub', basis: 'perServing', servingLabel: '1 tub', servingGrams: 170, energyKj: 510, proteinG: 17, fatG: 0.3, carbsG: 6.8, sodiumMg: 60 })
        .expect(201);
      const food = res.body as FoodDto;
      expect(food).toMatchObject({ isMine: true, sourceCode: 'custom', energyKj: 300, energyKcal: 71.7, proteinG: 10, sodiumMg: 35 });
      expect(food.servings[0]).toMatchObject({ label: '1 tub', grams: 170, imported: false });

      const found = (await ctx.agent.get('/api/foods/search?q=yoghurt').expect(200)).body as FoodSearchResponse;
      expect(found.results[0].id).toBe(food.id);

      await ctx.agent.delete(`/api/foods/${food.id}`).set(ctx.H).expect(204);
      const after = (await ctx.agent.get('/api/foods/search?q=yoghurt').expect(200)).body as FoodSearchResponse;
      expect(after.results.find((f) => f.id === food.id)).toBeUndefined();
    });

    it('refuses to edit imported foods', async () => {
      const oats = await foodId(ctx.db, 'Oats, rolled, uncooked');
      await ctx.agent.put(`/api/foods/${oats}`).set(ctx.H).send({ name: 'x', energyKj: 1, proteinG: 1, fatG: 1, carbsG: 1 }).expect(404);
    });

    it('makes a recipe searchable as a food with a per-serving size', async () => {
      const oats = await foodId(ctx.db, 'Oats, rolled, uncooked');
      const apple = await foodId(ctx.db, 'Apple, red delicious, with skin, raw');
      const res = await ctx.agent
        .post('/api/recipes')
        .set(ctx.H)
        .send({ kind: 'recipe', name: 'Overnight oats', servings: 2, cookedWeightG: 500, items: [{ foodId: oats, grams: 100 }, { foodId: apple, grams: 200 }] })
        .expect(201);
      const recipe = res.body as RecipeDto;
      expect(recipe.totals.energyKj).toBe(2058);
      expect(recipe.foodId).not.toBeNull();

      const food = (await ctx.agent.get(`/api/foods/${recipe.foodId}`).expect(200)).body as FoodDto;
      expect(food).toMatchObject({ sourceCode: 'recipe', recipeId: recipe.id, energyKj: 411.6 });
      expect(food.servings[0]).toMatchObject({ label: '1 serving (1/2)', grams: 250 });

      const logged = await ctx.agent.post(`/api/recipes/${recipe.id}/log`).set(ctx.H).send({ date: '2026-10-07', meal: 'breakfast' }).expect(201);
      expect(logged.body.logged).toBe(1);
      const day = (await ctx.agent.get('/api/log?date=2026-10-07').expect(200)).body as DayLogDto;
      expect(day.totals.energyKj).toBe(1029);

      // Deleting the recipe keeps the logged entry
      await ctx.agent.delete(`/api/recipes/${recipe.id}`).set(ctx.H).expect(204);
      expect((await ctx.agent.get('/api/log?date=2026-10-07').expect(200)).body.entries).toHaveLength(1);
    });

    it('logs a saved meal as separate entries in one tap', async () => {
      const oats = await foodId(ctx.db, 'Oats, rolled, uncooked');
      const apple = await foodId(ctx.db, 'Apple, red delicious, with skin, raw');
      const meal = (
        await ctx.agent
          .post('/api/recipes')
          .set(ctx.H)
          .send({ kind: 'meal', name: 'Usual breakfast', items: [{ foodId: oats, grams: 50 }, { foodId: apple, grams: 150 }] })
          .expect(201)
      ).body as RecipeDto;
      expect(meal.foodId).toBeNull();
      await ctx.agent.post(`/api/recipes/${meal.id}/log`).set(ctx.H).send({ date: '2026-10-08', meal: 'breakfast' }).expect(201);
      const day = (await ctx.agent.get('/api/log?date=2026-10-08').expect(200)).body as DayLogDto;
      expect(day.entries.map((e) => e.grams)).toEqual([50, 150]);
      expect(day.byMeal.breakfast.energyKj).toBe(1148.5);
    });
  });
});
