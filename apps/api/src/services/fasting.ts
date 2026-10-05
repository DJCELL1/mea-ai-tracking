import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { addDays, fastingHistory, isInWindow, localDate, windowFor, windowsFrom, zonedToUtc, type FastingHistory, type WindowOverride } from '@mea/shared';
import type { Db } from '../db/client.js';
import { logEntries, windowOverrides } from '../db/schema.js';
import { getSettings } from './settings.js';

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export async function overridesBetween(db: Db, userId: number, from: string, to: string): Promise<WindowOverride[]> {
  const rows = await db
    .select()
    .from(windowOverrides)
    .where(and(eq(windowOverrides.userId, userId), gte(windowOverrides.date, from), lte(windowOverrides.date, to)))
    .orderBy(asc(windowOverrides.date));
  return rows.map((r) => ({ date: r.date, startTime: hhmm(r.startTime), endTime: hhmm(r.endTime), isFastDay: r.isFastDay }));
}

/** Was food eaten at `eatenAt` (counted on `logDate`) outside that day's eating window? */
export async function isOutsideWindow(db: Db, userId: number, logDate: string, eatenAt: Date): Promise<boolean> {
  const s = await getSettings(db, userId);
  const [o] = await overridesBetween(db, userId, logDate, logDate);
  return !isInWindow(eatenAt, windowFor(logDate, s, o));
}

/** Recalculate stored outside-window flags after a window changes. */
export async function refreshOutsideWindow(db: Db, userId: number, from: string, to: string) {
  const s = await getSettings(db, userId);
  const overrides = new Map((await overridesBetween(db, userId, from, to)).map((o) => [o.date, o]));
  const entries = await db
    .select({ id: logEntries.id, logDate: logEntries.logDate, eatenAt: logEntries.eatenAt, outsideWindow: logEntries.outsideWindow })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), gte(logEntries.logDate, from), lte(logEntries.logDate, to)));
  const flip = entries.filter((e) => !isInWindow(e.eatenAt, windowFor(e.logDate, s, overrides.get(e.logDate))) !== e.outsideWindow);
  for (const e of flip) await db.update(logEntries).set({ outsideWindow: !e.outsideWindow }).where(eq(logEntries.id, e.id));
  return flip.length;
}

/** Everything the app needs to show eating/fasting status and countdowns. */
export async function fastingOverview(db: Db, userId: number, now = new Date()) {
  const s = await getSettings(db, userId);
  const today = localDate(now, s.timezone);
  const overrides = await overridesBetween(db, userId, addDays(today, -1), addDays(today, 14));
  const windows = windowsFrom(today, 8, s, overrides);
  const [last] = await db
    .select({ at: sql<Date>`max(${logEntries.eatenAt})` })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), sql`${logEntries.eatenAt} <= ${now}`));
  return {
    today,
    windows: windows.map((w) => ({ ...w, start: w.start.toISOString(), end: w.end.toISOString() })),
    overrides,
    lastFoodAt: last?.at ? new Date(last.at).toISOString() : null,
    defaults: { windowStart: s.windowStart, windowEnd: s.windowEnd, windowCloseWarningMin: s.windowCloseWarningMin, fastingGoalHours: s.fastingGoalHours },
  };
}

export async function setOverride(db: Db, userId: number, date: string, o: { startTime?: string; endTime?: string; isFastDay?: boolean }) {
  const values = { userId, date, startTime: o.isFastDay ? null : o.startTime ?? null, endTime: o.isFastDay ? null : o.endTime ?? null, isFastDay: !!o.isFastDay };
  await db
    .insert(windowOverrides)
    .values(values)
    .onConflictDoUpdate({ target: [windowOverrides.userId, windowOverrides.date], set: { startTime: values.startTime, endTime: values.endTime, isFastDay: values.isFastDay } });
  await refreshOutsideWindow(db, userId, date, date);
}

export async function clearOverride(db: Db, userId: number, date: string) {
  await db.delete(windowOverrides).where(and(eq(windowOverrides.userId, userId), eq(windowOverrides.date, date)));
  await refreshOutsideWindow(db, userId, date, date);
}

export async function history(db: Db, userId: number, days: number, now = new Date()): Promise<FastingHistory> {
  const s = await getSettings(db, userId);
  const to = localDate(now, s.timezone);
  const from = addDays(to, -(days - 1));
  // Include a few days before the range so the first day's fast has a starting point
  const rows = await db
    .select({ at: logEntries.eatenAt })
    .from(logEntries)
    .where(and(eq(logEntries.userId, userId), gte(logEntries.eatenAt, zonedToUtc(addDays(from, -7), '00:00', s.timezone)), sql`${logEntries.eatenAt} <= ${now}`));
  return fastingHistory(
    rows.map((r) => r.at),
    from,
    to,
    s.timezone,
    s.fastingGoalHours,
    now,
  );
}
