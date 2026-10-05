import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  kcalToKj,
  kjToKcal,
  localDate,
  localTime,
  MEALS,
  NUTRIENT_KEYS,
  round,
  scalePer100g,
  sumNutrients,
  zonedToUtc,
  type DayLogDto,
  type LogEntryDto,
  type Meal,
  type Nutrients,
} from '@mea/shared';
import type { Db } from '../db/client.js';
import { foods, foodServings, logEntries } from '../db/schema.js';
import { badRequest, notFound } from '../http.js';
import { isOutsideWindow, refreshOutsideWindow } from './fasting.js';
import { getFood, nutrientsOf } from './foods.js';

type EntryRow = typeof logEntries.$inferSelect;

/** Typical time of day for each meal, used when logging for a day other than today. */
const MEAL_TIMES: Record<Meal, string> = { breakfast: '08:00', lunch: '12:30', snack: '15:30', dinner: '18:30' };

/** When an entry was eaten: now if it's for today, otherwise the meal's usual time on that day. */
export function defaultEatenAt(date: string, meal: Meal, timeZone: string, now = new Date()): Date {
  if (date === localDate(now, timeZone)) return now;
  return zonedToUtc(date, MEAL_TIMES[meal], timeZone);
}

export async function entriesForDay(db: Db, userId: number, date: string): Promise<LogEntryDto[]> {
  const rows = await db
    .select({ e: logEntries, servingLabel: foodServings.label })
    .from(logEntries)
    .leftJoin(foodServings, eq(foodServings.id, logEntries.servingId))
    .where(and(eq(logEntries.userId, userId), eq(logEntries.logDate, date)))
    .orderBy(asc(logEntries.eatenAt), asc(logEntries.id));
  return rows.map((r) => toEntryDto(r.e, r.servingLabel));
}

export function toEntryDto(e: EntryRow, servingLabel: string | null): LogEntryDto {
  return {
    id: e.id,
    logDate: e.logDate,
    meal: e.meal,
    eatenAt: e.eatenAt.toISOString(),
    foodId: e.foodId,
    name: e.name,
    grams: e.grams,
    servingId: e.servingId,
    servingLabel,
    servingQty: e.servingQty,
    entryType: e.entryType,
    outsideWindow: e.outsideWindow,
    ...nutrientsOf(e),
  };
}

export async function dayLog(db: Db, userId: number, date: string): Promise<DayLogDto> {
  const entries = await entriesForDay(db, userId, date);
  const byMeal = Object.fromEntries(MEALS.map((m) => [m, sumNutrients(entries.filter((e) => e.meal === m))])) as Record<Meal, Nutrients>;
  return { date, entries, totals: sumNutrients(entries), byMeal };
}

export interface AmountInput {
  grams?: number;
  servingId?: number;
  servingQty?: number;
}

/** Work out grams from either grams or a serving × quantity. */
export async function resolveAmount(db: Db, foodId: number, a: AmountInput) {
  if (a.servingId != null) {
    const [s] = await db.select().from(foodServings).where(and(eq(foodServings.id, a.servingId), eq(foodServings.foodId, foodId)));
    if (!s) throw badRequest('That serving size does not belong to this food');
    const qty = a.servingQty ?? 1;
    return { grams: round(s.grams * qty, 1), servingId: s.id, servingQty: qty, servingLabel: s.label };
  }
  if (a.grams == null) throw badRequest('Give either grams or a serving');
  return { grams: a.grams, servingId: null, servingQty: null, servingLabel: null };
}

export interface FoodEntryInput extends AmountInput {
  date: string;
  meal: Meal;
  foodId: number;
  eatenAt?: Date;
}

export async function logFood(db: Db, userId: number, timeZone: string, input: FoodEntryInput): Promise<LogEntryDto> {
  const food = await getFood(db, userId, input.foodId);
  const amount = await resolveAmount(db, food.id, input);
  const eatenAt = input.eatenAt ?? defaultEatenAt(input.date, input.meal, timeZone);
  const [row] = await db
    .insert(logEntries)
    .values({
      userId,
      logDate: input.date,
      meal: input.meal,
      eatenAt,
      outsideWindow: await isOutsideWindow(db, userId, input.date, eatenAt),
      foodId: food.id,
      name: food.name,
      grams: amount.grams,
      servingId: amount.servingId,
      servingQty: amount.servingQty,
      entryType: 'food',
      ...scalePer100g(food, amount.grams),
    })
    .returning();
  return toEntryDto(row, amount.servingLabel);
}

export interface QuickAddInput {
  date: string;
  meal: Meal;
  name?: string;
  energyKcal?: number;
  energyKj?: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  eatenAt?: Date;
}

/** Fill whichever energy unit is missing. */
export function bothEnergies(kcal?: number | null, kj?: number | null) {
  if (kcal != null) return { energyKcal: round(kcal, 1), energyKj: kj != null ? round(kj, 1) : kcalToKj(kcal) };
  if (kj != null) return { energyKj: round(kj, 1), energyKcal: kjToKcal(kj) };
  return { energyKcal: null, energyKj: null };
}

export async function quickAdd(db: Db, userId: number, timeZone: string, input: QuickAddInput): Promise<LogEntryDto> {
  if (input.energyKcal == null && input.energyKj == null) throw badRequest('Quick add needs kcal or kJ');
  const eatenAt = input.eatenAt ?? defaultEatenAt(input.date, input.meal, timeZone);
  const [row] = await db
    .insert(logEntries)
    .values({
      userId,
      logDate: input.date,
      meal: input.meal,
      eatenAt,
      outsideWindow: await isOutsideWindow(db, userId, input.date, eatenAt),
      name: input.name?.trim() || 'Quick add',
      entryType: 'quick_add',
      ...bothEnergies(input.energyKcal, input.energyKj),
      proteinG: input.proteinG ?? null,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
    })
    .returning();
  return toEntryDto(row, null);
}

export interface EntryPatch extends AmountInput {
  date?: string;
  meal?: Meal;
  eatenAt?: Date;
  // Quick-add entries only
  name?: string;
  energyKcal?: number;
  energyKj?: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

async function ownEntry(db: Db, userId: number, id: number) {
  const [e] = await db.select().from(logEntries).where(and(eq(logEntries.id, id), eq(logEntries.userId, userId)));
  if (!e) throw notFound('Entry not found');
  return e;
}

export async function updateEntry(db: Db, userId: number, id: number, patch: EntryPatch): Promise<LogEntryDto> {
  const e = await ownEntry(db, userId, id);
  const set: Partial<typeof logEntries.$inferInsert> = { updatedAt: new Date() };
  if (patch.date) set.logDate = patch.date;
  if (patch.meal) set.meal = patch.meal;
  if (patch.eatenAt) set.eatenAt = patch.eatenAt;
  let servingLabel: string | null = null;

  const amountChanged = patch.grams != null || patch.servingId != null || patch.servingQty != null;
  if (e.entryType === 'quick_add') {
    if (patch.name != null) set.name = patch.name.trim() || 'Quick add';
    if (patch.energyKcal != null || patch.energyKj != null) Object.assign(set, bothEnergies(patch.energyKcal, patch.energyKj));
    if (patch.proteinG !== undefined) set.proteinG = patch.proteinG;
    if (patch.carbsG !== undefined) set.carbsG = patch.carbsG;
    if (patch.fatG !== undefined) set.fatG = patch.fatG;
  } else if (amountChanged) {
    const [food] = e.foodId ? await db.select().from(foods).where(eq(foods.id, e.foodId)) : [];
    // Keep the current serving when only the quantity changes
    const servingId = patch.servingId ?? (patch.grams == null ? e.servingId ?? undefined : undefined);
    if (food) {
      const amount = await resolveAmount(db, food.id, { grams: patch.grams, servingId, servingQty: patch.servingQty ?? (servingId ? e.servingQty ?? 1 : undefined) });
      Object.assign(set, { grams: amount.grams, servingId: amount.servingId, servingQty: amount.servingQty }, scalePer100g(food, amount.grams));
      servingLabel = amount.servingLabel;
    } else {
      // The food has been removed: scale the stored snapshot instead
      if (patch.grams == null || !e.grams) throw badRequest('This food no longer exists; change the amount in grams');
      const factor = patch.grams / e.grams;
      for (const k of NUTRIENT_KEYS) {
        const v = e[k];
        set[k] = v == null ? null : round(v * factor, k === 'sodiumMg' ? 0 : 1);
      }
      Object.assign(set, { grams: patch.grams, servingId: null, servingQty: null });
    }
  } else if (e.servingId) {
    const [s] = await db.select().from(foodServings).where(eq(foodServings.id, e.servingId));
    servingLabel = s?.label ?? null;
  }

  if (patch.date || patch.eatenAt) set.outsideWindow = await isOutsideWindow(db, userId, set.logDate ?? e.logDate, set.eatenAt ?? e.eatenAt);
  const [row] = await db.update(logEntries).set(set).where(eq(logEntries.id, id)).returning();
  return toEntryDto(row, servingLabel);
}

export async function deleteEntry(db: Db, userId: number, id: number) {
  await ownEntry(db, userId, id);
  await db.delete(logEntries).where(eq(logEntries.id, id));
}

/** Copy a day's entries (optionally only some meals) onto another day. */
export async function copyDay(
  db: Db,
  userId: number,
  timeZone: string,
  fromDate: string,
  toDate: string,
  meals?: Meal[],
): Promise<number> {
  const source = await db
    .select()
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), eq(logEntries.logDate, fromDate), meals?.length ? inArray(logEntries.meal, meals) : undefined));
  if (!source.length) return 0;
  const now = new Date();
  const isToday = toDate === localDate(now, timeZone);
  await db.insert(logEntries).values(
    source.map(({ id: _id, createdAt: _c, updatedAt: _u, logDate: _d, eatenAt, outsideWindow: _o, ...rest }) => ({
      ...rest,
      logDate: toDate,
      // Same time of day as the original, or now when copying onto today
      eatenAt: isToday ? now : zonedToUtc(toDate, localTime(eatenAt, timeZone), timeZone),
      entryType: rest.entryType === 'quick_add' ? ('quick_add' as const) : ('copied' as const),
    })),
  );
  await refreshOutsideWindow(db, userId, toDate, toDate);
  return source.length;
}
