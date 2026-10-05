/** Calendar dates are 'YYYY-MM-DD' strings in the user's timezone; times are 'HH:MM'. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Minutes the timezone is ahead of UTC at that instant (e.g. +600 for AEST, +660 for AEDT). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The local calendar date of an instant. */
export function localDate(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** The local wall-clock time of an instant, 'HH:MM'. */
export function localTime(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}

/** The instant a local date + time happens in a timezone (handles daylight saving). */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [hh, mm] = time.split(':');
  const guess = new Date(`${date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00Z`);
  const off1 = tzOffsetMinutes(guess, timeZone);
  const first = new Date(guess.getTime() - off1 * 60000);
  const off2 = tzOffsetMinutes(first, timeZone);
  return off2 === off1 ? first : new Date(guess.getTime() - off2 * 60000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
