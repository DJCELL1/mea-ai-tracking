import { addDays, localDate, zonedToUtc } from './dates.js';

export interface WindowOverride {
  date: string;
  startTime: string | null;
  endTime: string | null;
  isFastDay: boolean;
}

export interface EatingWindow {
  date: string;
  /** Local times 'HH:MM'. */
  startTime: string;
  endTime: string;
  start: Date;
  end: Date;
  /** No eating window at all that day. */
  isFastDay: boolean;
  /** Set for that day only (rather than your default window). */
  isOverride: boolean;
}

export interface WindowDefaults {
  timezone: string;
  windowStart: string;
  windowEnd: string;
}

/** The eating window for a local date: the day's override if there is one, else the default. */
export function windowFor(date: string, s: WindowDefaults, override?: WindowOverride | null): EatingWindow {
  const startTime = (override?.startTime ?? s.windowStart).slice(0, 5);
  const endTime = (override?.endTime ?? s.windowEnd).slice(0, 5);
  return {
    date,
    startTime,
    endTime,
    start: zonedToUtc(date, startTime, s.timezone),
    end: zonedToUtc(date, endTime, s.timezone),
    isFastDay: override?.isFastDay ?? false,
    isOverride: !!override,
  };
}

/** Windows for `days` consecutive dates starting at `from`. */
export function windowsFrom(from: string, days: number, s: WindowDefaults, overrides: WindowOverride[]): EatingWindow[] {
  const byDate = new Map(overrides.map((o) => [o.date, o]));
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    return windowFor(d, s, byDate.get(d));
  });
}

export function isInWindow(at: Date, w: EatingWindow): boolean {
  return !w.isFastDay && at >= w.start && at < w.end;
}

export interface FastingStatus {
  state: 'eating' | 'fasting';
  /** When the state next changes (window closes, or next window opens). Null if no window in the next week. */
  changesAt: Date | null;
  /** The window that is open now, or the next one to open. */
  window: EatingWindow | null;
}

/** Am I eating or fasting right now, and until when? `windows` should start at today (local). */
export function fastingStatus(now: Date, windows: EatingWindow[]): FastingStatus {
  for (const w of windows) {
    if (w.isFastDay || w.end <= now) continue;
    if (now >= w.start) return { state: 'eating', changesAt: w.end, window: w };
    return { state: 'fasting', changesAt: w.start, window: w };
  }
  return { state: 'fasting', changesAt: null, window: null };
}

export interface FastingDay {
  date: string;
  /** First food that day (ends the fast). */
  firstFoodAt: string | null;
  /** Last food before that (starts the fast). */
  fastStartAt: string | null;
  hoursFasted: number | null;
  metGoal: boolean;
  /** True for today when nothing has been eaten yet: hours so far. */
  ongoing: boolean;
  noFood: boolean;
  /** Before you started logging: not counted either way. */
  untracked: boolean;
}

export interface FastingHistory {
  goalHours: number;
  days: FastingDay[];
  currentStreak: number;
  longestStreak: number;
  averageHours: number | null;
}

/**
 * Hours fasted per day = time from the last food before the day's first food to that first food.
 * Uses when food was actually eaten (in your timezone), not which day it was logged against.
 * A day with no food logged after you started logging counts towards the streak (you fasted
 * through it); days before your first logged food aren't counted. Today with no food yet shows
 * the fast so far.
 */
export function fastingHistory(eatenAt: Date[], from: string, to: string, timeZone: string, goalHours: number, now = new Date()): FastingHistory {
  const times = [...eatenAt].sort((a, b) => a.getTime() - b.getTime());
  const today = localDate(now, timeZone);
  const days: FastingDay[] = [];

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dayStart = zonedToUtc(d, '00:00', timeZone);
    const dayEnd = zonedToUtc(addDays(d, 1), '00:00', timeZone);
    const first = times.find((t) => t >= dayStart && t < dayEnd) ?? null;
    if (first) {
      const prev = [...times].reverse().find((t) => t < first) ?? null;
      const hours = prev ? Math.round(((first.getTime() - prev.getTime()) / 3.6e6) * 10) / 10 : null;
      days.push({ date: d, firstFoodAt: first.toISOString(), fastStartAt: prev?.toISOString() ?? null, hoursFasted: hours, metGoal: hours != null && hours >= goalHours, ongoing: false, noFood: false, untracked: false });
    } else if (d === today) {
      const prev = [...times].reverse().find((t) => t < now) ?? null;
      const hours = prev ? Math.round(((now.getTime() - prev.getTime()) / 3.6e6) * 10) / 10 : null;
      days.push({ date: d, firstFoodAt: null, fastStartAt: prev?.toISOString() ?? null, hoursFasted: hours, metGoal: hours != null && hours >= goalHours, ongoing: true, noFood: true, untracked: !prev });
    } else {
      const tracking = times.some((t) => t < dayStart);
      days.push({ date: d, firstFoodAt: null, fastStartAt: null, hoursFasted: null, metGoal: tracking, ongoing: false, noFood: true, untracked: !tracking });
    }
  }

  // Streaks: an in-progress today only extends the streak once it has reached the goal
  const counted = days.filter((x) => !x.untracked && !(x.ongoing && !x.metGoal));
  let longest = 0;
  let run = 0;
  for (const x of counted) {
    run = x.metGoal ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let i = counted.length - 1; i >= 0 && counted[i].metGoal; i--) current++;

  const measured = days.filter((x) => x.hoursFasted != null && !x.ongoing).map((x) => x.hoursFasted!);
  const averageHours = measured.length ? Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 10) / 10 : null;
  return { goalHours, days, currentStreak: current, longestStreak: longest, averageHours };
}

/** "3 h 05 m", "45 m", "1 d 23 h" */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d) return `${d} d ${h} h`;
  return h ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`;
}
