import { Router } from 'express';
import type { Db } from '../db/client.js';
import { uid } from '../auth/session.js';
import { deleteRecipe, getRecipe, listRecipes, logRecipe, saveRecipe } from '../services/recipes.js';
import { getSettings } from '../services/settings.js';
import { idParam, logRecipeBody, recipeBody } from './validators.js';

export function recipesRouter(db: Db) {
  const r = Router();

  r.get('/recipes', async (req, res) => {
    res.json(await listRecipes(db, uid(req)));
  });

  r.get('/recipes/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await getRecipe(db, uid(req), id));
  });

  r.post('/recipes', async (req, res) => {
    res.status(201).json(await saveRecipe(db, uid(req), recipeBody.parse(req.body)));
  });

  r.put('/recipes/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await saveRecipe(db, uid(req), recipeBody.parse(req.body), id));
  });

  r.delete('/recipes/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await deleteRecipe(db, uid(req), id);
    res.status(204).end();
  });

  r.post('/recipes/:id/log', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = logRecipeBody.parse(req.body);
    const { timezone } = await getSettings(db, uid(req));
    const entries = await logRecipe(db, uid(req), timezone, id, body.date, body.meal, body.servings);
    res.status(201).json({ logged: entries.length });
  });

  return r;
}
