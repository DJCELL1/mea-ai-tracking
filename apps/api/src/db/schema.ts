import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { ENTRY_TYPES, MEALS, RECIPE_KINDS } from '@mea/shared';

export const mealEnum = pgEnum('meal', MEALS);
export const entryTypeEnum = pgEnum('entry_type', ENTRY_TYPES);
export const recipeKindEnum = pgEnum('recipe_kind', RECIPE_KINDS);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Nutrient columns shared by foods (per 100 g) and log entries (totals). Null = not measured. */
const nutrientColumns = () => ({
  energyKj: doublePrecision('energy_kj'),
  energyKcal: doublePrecision('energy_kcal'),
  proteinG: doublePrecision('protein_g'),
  fatG: doublePrecision('fat_g'),
  carbsG: doublePrecision('carbs_g'),
  sugarsG: doublePrecision('sugars_g'),
  fibreG: doublePrecision('fibre_g'),
  sodiumMg: doublePrecision('sodium_mg'),
});

// ---------- Auth ----------

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamps.createdAt,
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the raw token only lives in the cookie. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ---------- Settings ----------

export const settings = pgTable('settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('Australia/Sydney'),

  kcalTarget: integer('kcal_target').notNull().default(2000),
  proteinGTarget: integer('protein_g_target').notNull().default(150),
  carbsGTarget: integer('carbs_g_target').notNull().default(200),
  fatGTarget: integer('fat_g_target').notNull().default(65),

  closeAlertPct: integer('close_alert_pct').notNull().default(90),
  proteinNudgeTime: time('protein_nudge_time').notNull().default('15:00'),
  proteinNudgePct: integer('protein_nudge_pct').notNull().default(50),

  windowStart: time('window_start').notNull().default('12:00'),
  windowEnd: time('window_end').notNull().default('20:00'),
  windowCloseWarningMin: integer('window_close_warning_min').notNull().default(30),
  fastingGoalHours: doublePrecision('fasting_goal_hours').notNull().default(16),

  notifyWindowOpen: boolean('notify_window_open').notNull().default(true),
  notifyWindowClosing: boolean('notify_window_closing').notNull().default(true),
  notifyWindowClosed: boolean('notify_window_closed').notNull().default(true),
  notifyProtein: boolean('notify_protein').notNull().default(true),
  notifyTargets: boolean('notify_targets').notNull().default(true),

  updatedAt: timestamps.updatedAt,
});

// ---------- Foods ----------

export const foodSources = pgTable('food_sources', {
  id: serial('id').primaryKey(),
  /** Stable code used by importers, e.g. 'afcd', 'custom', 'recipe', 'nzfcd'. */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  version: text('version'),
  createdAt: timestamps.createdAt,
});

export const importRuns = pgTable('import_runs', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id')
    .notNull()
    .references(() => foodSources.id),
  fileName: text('file_name').notNull(),
  fileSha256: text('file_sha256').notNull(),
  rowsRead: integer('rows_read').notNull().default(0),
  inserted: integer('inserted').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const foods = pgTable(
  'foods',
  {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id')
      .notNull()
      .references(() => foodSources.id),
    /** ID in the source dataset (AFCD Public Food Key). Null for custom foods. */
    sourceFoodId: text('source_food_id'),
    /** Owner of a custom food or recipe; null for imported foods. */
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Set when this food is the derived row for a recipe. */
    recipeId: integer('recipe_id').references((): any => recipes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // All per 100 g
    ...nutrientColumns(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('foods_source_food_uq').on(t.sourceId, t.sourceFoodId),
    uniqueIndex('foods_recipe_uq').on(t.recipeId),
    index('foods_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('foods_user_idx').on(t.userId),
  ],
);

export const foodServings = pgTable(
  'food_servings',
  {
    id: serial('id').primaryKey(),
    foodId: integer('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    grams: doublePrecision('grams').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    /** True for servings that came from a data source; re-imports replace these but never user-added ones. */
    imported: boolean('imported').notNull().default(false),
  },
  (t) => [index('food_servings_food_idx').on(t.foodId)],
);

// ---------- Recipes & saved meals ----------

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 'recipe' = logged as one food by grams/servings; 'meal' = logs each item separately. */
  kind: recipeKindEnum('kind').notNull(),
  name: text('name').notNull(),
  /** Weight of the finished dish; defaults to the sum of ingredient weights. */
  cookedWeightG: doublePrecision('cooked_weight_g'),
  servings: doublePrecision('servings').notNull().default(1),
  notes: text('notes'),
  ...timestamps,
});

export const recipeItems = pgTable(
  'recipe_items',
  {
    id: serial('id').primaryKey(),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    foodId: integer('food_id')
      .notNull()
      .references(() => foods.id),
    grams: doublePrecision('grams').notNull(),
    meal: mealEnum('meal'),
  },
  (t) => [index('recipe_items_recipe_idx').on(t.recipeId)],
);

// ---------- Log ----------

export const logEntries = pgTable(
  'log_entries',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The local calendar day (in the user's timezone) this entry counts towards. */
    logDate: date('log_date').notNull(),
    meal: mealEnum('meal').notNull(),
    eatenAt: timestamp('eaten_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null for quick-add entries. */
    foodId: integer('food_id').references(() => foods.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    grams: doublePrecision('grams'),
    servingId: integer('serving_id').references(() => foodServings.id, { onDelete: 'set null' }),
    servingQty: doublePrecision('serving_qty'),
    // Snapshot of the totals for this entry, so editing a food never rewrites history
    ...nutrientColumns(),
    entryType: entryTypeEnum('entry_type').notNull().default('food'),
    outsideWindow: boolean('outside_window').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('log_entries_user_date_idx').on(t.userId, t.logDate),
    index('log_entries_user_food_idx').on(t.userId, t.foodId),
  ],
);

// ---------- Fasting ----------
// Hours fasted are calculated from log entries when needed, so edits are always reflected.

export const windowOverrides = pgTable(
  'window_overrides',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    /** No eating window at all on this day. */
    isFastDay: boolean('is_fast_day').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

// ---------- Notifications ----------

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamps.createdAt,
});

export const notificationsSent = pgTable(
  'notifications_sent',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. 'window_open', 'window_closing', 'protein_nudge', 'kcal_close', 'over_protein'. */
    kind: text('kind').notNull(),
    date: date('date').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.date] })],
);
