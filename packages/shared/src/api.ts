import type { EntryType, Meal, RecipeKind } from './types.js';
import type { Nutrients } from './nutrition.js';

export interface ServingDto {
  id: number;
  label: string;
  grams: number;
  isDefault: boolean;
  /** False for servings you added yourself (those can be deleted). */
  imported: boolean;
}

export interface FoodDto extends Nutrients {
  id: number;
  name: string;
  description: string | null;
  /** 'afcd', 'custom', 'recipe', … */
  sourceCode: string;
  /** True for custom foods and recipes you own (editable). */
  isMine: boolean;
  recipeId: number | null;
  servings: ServingDto[];
  /** How many times you've logged it recently (search results only). */
  uses?: number;
}

export interface FoodSearchResponse {
  query: string;
  results: FoodDto[];
  /** Only when the query is empty. */
  recent?: FoodDto[];
  frequent?: FoodDto[];
}

export interface LogEntryDto extends Nutrients {
  id: number;
  logDate: string;
  meal: Meal;
  eatenAt: string;
  foodId: number | null;
  name: string;
  grams: number | null;
  servingId: number | null;
  servingLabel: string | null;
  servingQty: number | null;
  entryType: EntryType;
  outsideWindow: boolean;
}

export interface DayLogDto {
  date: string;
  entries: LogEntryDto[];
  totals: Nutrients;
  byMeal: Record<Meal, Nutrients>;
}

export interface RecipeItemDto {
  id: number;
  food: FoodDto;
  grams: number;
  meal: Meal | null;
}

export interface RecipeDto {
  id: number;
  kind: RecipeKind;
  name: string;
  cookedWeightG: number | null;
  servings: number;
  notes: string | null;
  items: RecipeItemDto[];
  /** Total nutrients of the whole recipe/meal. */
  totals: Nutrients;
  /** For kind 'recipe': the searchable food it creates. */
  foodId: number | null;
}

export interface SettingsDto {
  timezone: string;
  kcalTarget: number;
  proteinGTarget: number;
  carbsGTarget: number;
  fatGTarget: number;
  closeAlertPct: number;
  proteinNudgeTime: string;
  proteinNudgePct: number;
  windowStart: string;
  windowEnd: string;
  windowCloseWarningMin: number;
  fastingGoalHours: number;
  notifyWindowOpen: boolean;
  notifyWindowClosing: boolean;
  notifyWindowClosed: boolean;
  notifyProtein: boolean;
  notifyTargets: boolean;
}

export interface MeDto {
  email: string;
  today: string;
  settings: SettingsDto;
}
