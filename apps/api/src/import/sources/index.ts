import type { FoodSourceAdapter } from '../adapter.js';
import { afcd } from './afcd.js';

/** Register new data sources here. */
export const sources: Record<string, FoodSourceAdapter> = {
  [afcd.code]: afcd,
};
