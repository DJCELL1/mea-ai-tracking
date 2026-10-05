import { describe, expect, it } from 'vitest';
import { fastingHistory, fastingStatus, formatDuration, isInWindow, windowFor, windowsFrom } from './fasting.js';

const s = { timezone: 'Australia/Sydney', windowStart: '12:00', windowEnd: '20:00' };
const at = (d: string, t: string) => new Date(`${d}T${t}:00+11:00`); // AEDT

describe('eating window', () => {
  it('uses the default or the day override', () => {
    const w = windowFor('2026-10-05', s);
    expect(w.start.toISOString()).toBe('2026-10-05T01:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-05T09:00:00.000Z');
    const o = windowFor('2026-10-05', s, { date: '2026-10-05', startTime: '10:00:00', endTime: null, isFastDay: false });
    expect([o.startTime, o.endTime, o.isOverride]).toEqual(['10:00', '20:00', true]);
  });

  it('says eating inside the window and fasting outside, with the next change', () => {
    const ws = windowsFrom('2026-10-05', 3, s, [{ date: '2026-10-06', startTime: null, endTime: null, isFastDay: true }]);
    expect(fastingStatus(at('2026-10-05', '09:00'), ws)).toMatchObject({ state: 'fasting', changesAt: at('2026-10-05', '12:00') });
    expect(fastingStatus(at('2026-10-05', '13:00'), ws)).toMatchObject({ state: 'eating', changesAt: at('2026-10-05', '20:00') });
    // After tonight's close, tomorrow is a fast day, so the next window is the day after
    expect(fastingStatus(at('2026-10-05', '21:00'), ws)).toMatchObject({ state: 'fasting', changesAt: at('2026-10-07', '12:00') });
    expect(isInWindow(at('2026-10-05', '20:00'), ws[0])).toBe(false);
  });
});

describe('fasting history', () => {
  const eaten = [at('2026-10-03', '19:30'), at('2026-10-04', '12:15'), at('2026-10-04', '19:00'), at('2026-10-05', '09:00'), at('2026-10-05', '18:00')];

  it('measures hours from the last food to the next day’s first food', () => {
    const h = fastingHistory(eaten, '2026-10-04', '2026-10-06', 'Australia/Sydney', 16, at('2026-10-06', '10:00'));
    expect(h.days.map((d) => [d.date, d.hoursFasted, d.metGoal, d.ongoing])).toEqual([
      ['2026-10-04', 16.8, true, false],
      ['2026-10-05', 14, false, false],
      ['2026-10-06', 16, true, true], // nothing yet today: 16 h so far
    ]);
    expect(h.currentStreak).toBe(1);
    expect(h.longestStreak).toBe(1);
    expect(h.averageHours).toBe(15.4);
  });

  it('does not let an unfinished today break the streak', () => {
    const h = fastingHistory(eaten.slice(0, 3), '2026-10-04', '2026-10-05', 'Australia/Sydney', 16, at('2026-10-05', '08:00'));
    expect(h.days[1]).toMatchObject({ ongoing: true, metGoal: false, hoursFasted: 13 });
    expect(h.currentStreak).toBe(1);
  });

  it('does not count days before you started logging', () => {
    const h = fastingHistory([], '2026-10-01', '2026-10-05', 'Australia/Sydney', 16, at('2026-10-05', '10:00'));
    expect(h.currentStreak).toBe(0);
    expect(h.days.every((d) => d.untracked)).toBe(true);
    // A no-food day between logged days counts
    const g = fastingHistory([at('2026-10-02', '19:00'), at('2026-10-04', '12:00')], '2026-10-02', '2026-10-04', 'Australia/Sydney', 16, at('2026-10-04', '20:00'));
    expect(g.days.map((d) => [d.untracked, d.metGoal])).toEqual([
      [false, false], // first logged day: no earlier food to measure from
      [false, true],
      [false, true],
    ]);
    expect(g.currentStreak).toBe(2);
  });

  it('formats durations', () => {
    expect(formatDuration(3 * 3.6e6 + 5 * 60000)).toBe('3 h 05 m');
    expect(formatDuration(45 * 60000)).toBe('45 m');
    expect(formatDuration(47 * 3.6e6 + 51 * 60000)).toBe('1 d 23 h');
  });
});
