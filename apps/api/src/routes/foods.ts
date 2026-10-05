import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { uid } from '../auth/session.js';
import { getFood } from '../services/foods.js';
import { searchFoods } from '../services/search.js';
import { addServing, archiveCustomFood, createCustomFood, deleteServing, updateCustomFood } from '../services/custom-foods.js';
import { customFoodBody, idParam, servingBody } from './validators.js';
import { and, eq, isNull } from 'drizzle-orm';
import { foods, foodSources } from '../db/schema.js';
import { hydrate } from '../services/foods.js';

export function foodsRouter(db: Db) {
  const r = Router();

  r.get('/foods/search', async (req, res) => {
    const { q, limit } = z.object({ q: z.string().default(''), limit: z.coerce.number().int().min(1).max(50).default(30) }).parse(req.query);
    res.json(await searchFoods(db, uid(req), q, limit));
  });

  /** Your custom foods (not recipes). */
  r.get('/foods/mine', async (req, res) => {
    const rows = await db
      .select({ food: foods, code: foodSources.code })
      .from(foods)
      .innerJoin(foodSources, eq(foodSources.id, foods.sourceId))
      .where(and(eq(foods.userId, uid(req)), isNull(foods.recipeId), isNull(foods.archivedAt)))
      .orderBy(foods.name);
    res.json(await hydrate(db, uid(req), rows));
  });

  r.get('/foods/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await getFood(db, uid(req), id, { includeArchived: true }));
  });

  r.post('/foods', async (req, res) => {
    res.status(201).json(await createCustomFood(db, uid(req), customFoodBody.parse(req.body)));
  });

  r.put('/foods/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await updateCustomFood(db, uid(req), id, customFoodBody.parse(req.body)));
  });

  r.delete('/foods/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await archiveCustomFood(db, uid(req), id);
    res.status(204).end();
  });

  r.post('/foods/:id/servings', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = servingBody.parse(req.body);
    res.status(201).json(await addServing(db, uid(req), id, body.label, body.grams));
  });

  r.delete('/servings/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await deleteServing(db, uid(req), id);
    res.status(204).end();
  });

  return r;
}
