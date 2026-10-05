import type { FoodSourceAdapter } from '../adapter.js';
import { afcd } from './afcd.js';
import { myFoodData } from './myfooddata.js';

/** Register new data sources here. */
export const sources: Record<string, FoodSourceAdapter> = {
  [afcd.code]: afcd,
  [myFoodData.code]: myFoodData,
};
