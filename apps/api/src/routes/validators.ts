import { isDateString, MEALS, RECIPE_KINDS } from '@mea/shared';
import { z } from 'zod';

export const dateStr = z.string().refine(isDateString, 'must be a date YYYY-MM-DD');
export const meal = z.enum(MEALS);
export const id = z.coerce.number().int().positive();
export const idParam = z.object({ id });
const grams = z.number().positive().max(10_000);
const nutrient = z.number().min(0).max(100_000);
const optNutrient = nutrient.nullable().optional();

export const logFoodBody = z.object({
  date: dateStr,
  meal,
  foodId: id,
  grams: grams.optional(),
  servingId: id.optional(),
  servingQty: z.number().positive().max(100).optional(),
  eatenAt: z.coerce.date().optional(),
});

export const quickAddBody = z.object({
  date: dateStr,
  meal,
  name: z.string().max(120).optional(),
  energyKcal: nutrient.optional(),
  energyKj: nutrient.optional(),
  proteinG: optNutrient,
  carbsG: optNutrient,
  fatG: optNutrient,
  eatenAt: z.coerce.date().optional(),
});

export const entryPatchBody = z.object({
  date: dateStr.optional(),
  meal: meal.optional(),
  eatenAt: z.coerce.date().optional(),
  grams: grams.optional(),
  servingId: id.optional(),
  servingQty: z.number().positive().max(100).optional(),
  name: z.string().max(120).optional(),
  energyKcal: nutrient.optional(),
  energyKj: nutrient.optional(),
  proteinG: optNutrient,
  carbsG: optNutrient,
  fatG: optNutrient,
});

export const copyDayBody = z.object({
  fromDate: dateStr,
  toDate: dateStr,
  meals: z.array(meal).optional(),
});

export const customFoodBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  basis: z.enum(['per100g', 'perServing']).default('per100g'),
  servingLabel: z.string().max(60).optional(),
  servingGrams: grams.optional(),
  energyKj: nutrient.optional(),
  energyKcal: nutrient.optional(),
  proteinG: nutrient,
  fatG: nutrient,
  carbsG: nutrient,
  sugarsG: optNutrient,
  fibreG: optNutrient,
  sodiumMg: optNutrient,
});

export const servingBody = z.object({ label: z.string().trim().min(1).max(60), grams });

export const recipeBody = z.object({
  kind: z.enum(RECIPE_KINDS),
  name: z.string().trim().min(1).max(200),
  cookedWeightG: grams.nullable().optional(),
  servings: z.number().positive().max(100).default(1),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(z.object({ foodId: id, grams, meal: meal.nullable().optional() })).min(1).max(100),
});

export const logRecipeBody = z.object({ date: dateStr, meal, servings: z.number().positive().max(100).optional() });
