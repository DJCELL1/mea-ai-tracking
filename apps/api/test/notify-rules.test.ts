import { describe, expect, it } from 'vitest';
import { emptyNutrients, windowFor, type Nutrients, type SettingsDto } from '@mea/shared';
import { dueNotifications } from '../src/services/notify-rules.js';

const s: SettingsDto = {
  timezone: 'Australia/Sydney',
  kcalTarget: 2000,
  proteinGTarget: 150,
  carbsGTarget: 200,
  fatGTarget: 60,
  closeAlertPct: 90,
  proteinNudgeTime: '15:00',
  proteinNudgePct: 50,
  windowStart: '12:00',
  windowEnd: '20:00',
  windowCloseWarningMin: 30,
  fastingGoalHours: 16,
  notifyWindowOpen: true,
  notifyWindowClosing: true,
  notifyWindowClosed: true,
  notifyProtein: true,
  notifyTargets: true,
};
const D = '2026-10-05';
const at = (t: string) => new Date(`${D}T${t}:00+11:00`);
const w = windowFor(D, s);
const n = (p: Partial<Nutrients>) => ({ ...emptyNutrients(), ...p });
const kinds = (now: Date, totals = n({ proteinG: 100 }), settings = s) => dueNotifications(now, settings, D, w, totals).map((x) => x.kind);

describe('dueNotifications', () => {
  it('sends window open, closing and closed at the right times', () => {
    expect(kinds(at('11:59'))).toEqual([]);
    expect(kinds(at('12:00'))).toEqual(['window_open']);
    expect(kinds(at('12:14'))).toEqual(['window_open']);
    expect(kinds(at('12:15'))).toEqual([]);
    expect(kinds(at('19:30'))).toEqual(['window_closing']);
    expect(dueNotifications(at('19:42'), s, D, w, n({ proteinG: 100 }))[0].title).toBe('Eating window closes in 18 min');
    expect(kinds(at('20:00'))).toEqual(['window_closed']);
    expect(kinds(at('20:20'))).toEqual([]);
  });

  it('respects the switches and fast days', () => {
    expect(kinds(at('12:00'), n({ proteinG: 100 }), { ...s, notifyWindowOpen: false })).toEqual([]);
    const fast = windowFor(D, s, { date: D, startTime: null, endTime: null, isFastDay: true });
    expect(dueNotifications(at('12:00'), s, D, fast, n({ proteinG: 100 }))).toEqual([]);
  });

  it('nudges for protein with an idea, but not late at night', () => {
    const due = dueNotifications(at('15:05'), s, D, w, n({ proteinG: 30 }), '150 g Chicken breast (45 g protein)');
    expect(due.map((d) => d.kind)).toEqual(['protein_nudge']);
    expect(due[0].body).toMatch(/Try 150 g Chicken breast/);
    expect(kinds(at('22:30'), n({ proteinG: 30 }))).toEqual([]);
  });

  it('sends target warnings unless turned off', () => {
    expect(kinds(at('13:00'), n({ energyKcal: 1850, proteinG: 100 }))).toEqual(['kcal_close']);
    expect(kinds(at('13:00'), n({ energyKcal: 2100, proteinG: 100, fatG: 70 }))).toEqual(['kcal_over', 'fat_over']);
    expect(kinds(at('13:00'), n({ energyKcal: 2100, proteinG: 100 }), { ...s, notifyTargets: false })).toEqual([]);
  });
});
