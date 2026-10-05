export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];

export const ENTRY_TYPES = ['food', 'quick_add', 'copied'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const RECIPE_KINDS = ['recipe', 'meal'] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];
