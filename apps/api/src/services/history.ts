import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { addDays, fastingHistory, isDateString, zonedToUtc, type Nutrients } from '@mea/shared';
import type { Db } from '../db/client.js';
import { foodServings, logEntries } from '../db/schema.js';
import { badRequest } from '../http.js';
import { getSettings } from './settings.js';

export interface HistoryDay extends Nutrients {
  date: string;
  entries: number;
  hoursFasted: number | null;
  fastingGoalMet: boolean | null;
  outsideWindow: number;
}

export interface HistoryResponse {
  from: string;
  to: string;
  /** Your current targets (past days are compared against today's targets). */
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number; fastingGoalHours: number };
  days: HistoryDay[];
}

const MAX_DAYS = 400;

export function checkRange(from: string, to: string) {
  if (!isDateString(from) || !isDateString(to) || from > to) throw badRequest('Give a valid date range (from ≤ to)');
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (span > MAX_DAYS) throw badRequest(`Ranges are limited to ${MAX_DAYS} days`);
}

const r1 = (v: number | null, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export async function dailyHistory(db: Db, userId: number, from: string, to: string, now = new Date()): Promise<HistoryResponse> {
  checkRange(from, to);
  const s = await getSettings(db, userId);
  const rows = await db
    .select({
      date: logEntries.logDate,
      entries: sql<number>`count(*)::int`,
      energyKj: sql<number | null>`sum(${logEntries.energyKj})`,
      energyKcal: sql<number | null>`sum(${logEntries.energyKcal})`,
      proteinG: sql<number | null>`sum(${logEntries.proteinG})`,
      fatG: sql<number | null>`sum(${logEntries.fatG})`,
      carbsG: sql<number | null>`sum(${logEntries.carbsG})`,
      sugarsG: sql<number | null>`sum(${logEntries.sugarsG})`,
      fibreG: sql<number | null>`sum(${logEntries.fibreG})`,
      sodiumMg: sql<number | null>`sum(${logEntries.sodiumMg})`,
      outsideWindow: sql<number>`count(*) FILTER (WHERE ${logEntries.outsideWindow})::int`,
    })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), gte(logEntries.logDate, from), lte(logEntries.logDate, to)))
    .groupBy(logEntries.logDate);
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const eaten = await db
    .select({ at: logEntries.eatenAt })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), gte(logEntries.eatenAt, zonedToUtc(addDays(from, -7), '00:00', s.timezone)), lte(logEntries.eatenAt, zonedToUtc(addDays(to, 1), '00:00', s.timezone))));
  const fasting = new Map(fastingHistory(eaten.map((e) => e.at), from, to, s.timezone, s.fastingGoalHours, now).days.map((d) => [d.date, d]));

  const days: HistoryDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = byDate.get(d);
    const f = fasting.get(d);
    const measured = f && !f.untracked && !f.ongoing && f.hoursFasted != null;
    days.push({
      date: d,
      entries: r?.entries ?? 0,
      energyKj: r1(r?.energyKj ?? null, 0),
      energyKcal: r1(r?.energyKcal ?? null, 0),
      proteinG: r1(r?.proteinG ?? null),
      fatG: r1(r?.fatG ?? null),
      carbsG: r1(r?.carbsG ?? null),
      sugarsG: r1(r?.sugarsG ?? null),
      fibreG: r1(r?.fibreG ?? null),
      sodiumMg: r1(r?.sodiumMg ?? null, 0),
      outsideWindow: r?.outsideWindow ?? 0,
      hoursFasted: measured ? f!.hoursFasted : null,
      fastingGoalMet: measured ? f!.metGoal : null,
    });
  }
  return {
    from,
    to,
    targets: { kcal: s.kcalTarget, proteinG: s.proteinGTarget, carbsG: s.carbsGTarget, fatG: s.fatGTarget, fastingGoalHours: s.fastingGoalHours },
    days,
  };
}

// ---------- CSV export ----------

/** Quote a CSV field; also neutralise leading =,+,-,@ so spreadsheets don't run it as a formula. */
export function csvField(v: unknown): string {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export async function entriesCsv(db: Db, userId: number, from: string, to: string): Promise<string> {
  checkRange(from, to);
  const s = await getSettings(db, userId);
  const rows = await db
    .select({ e: logEntries, servingLabel: foodServings.label })
    .from(logEntries)
    .leftJoin(foodServings, eq(foodServings.id, logEntries.servingId))
    .where(and(eq(logEntries.userId, userId), gte(logEntries.logDate, from), lte(logEntries.logDate, to)))
    .orderBy(asc(logEntries.logDate), asc(logEntries.eatenAt), asc(logEntries.id));
  const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: s.timezone });
  return toCsv(
    ['date', 'time', 'meal', 'food', 'grams', 'serving', 'servings', 'energy_kj', 'energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'sugars_g', 'fibre_g', 'sodium_mg', 'type', 'outside_window'],
    rows.map(({ e, servingLabel }) => [
      e.logDate,
      time(e.eatenAt),
      e.meal,
      e.name,
      e.grams,
      servingLabel,
      e.servingQty,
      e.energyKj,
      e.energyKcal,
      e.proteinG,
      e.carbsG,
      e.fatG,
      e.sugarsG,
      e.fibreG,
      e.sodiumMg,
      e.entryType,
      e.outsideWindow ? 'yes' : 'no',
    ]),
  );
}

export async function dailyCsv(db: Db, userId: number, from: string, to: string): Promise<string> {
  const h = await dailyHistory(db, userId, from, to);
  const t = h.targets;
  return toCsv(
    ['date', 'entries', 'energy_kj', 'energy_kcal', 'kcal_target', 'protein_g', 'protein_target_g', 'carbs_g', 'carbs_target_g', 'fat_g', 'fat_target_g', 'sugars_g', 'fibre_g', 'sodium_mg', 'hours_fasted', 'fasting_goal_met', 'entries_outside_window'],
    h.days.map((d) => [
      d.date,
      d.entries,
      d.energyKj,
      d.energyKcal,
      t.kcal,
      d.proteinG,
      t.proteinG,
      d.carbsG,
      t.carbsG,
      d.fatG,
      t.fatG,
      d.sugarsG,
      d.fibreG,
      d.sodiumMg,
      d.hoursFasted,
      d.fastingGoalMet == null ? '' : d.fastingGoalMet ? 'yes' : 'no',
      d.outsideWindow,
    ]),
  );
}
