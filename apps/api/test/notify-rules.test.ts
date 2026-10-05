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

  it('nudges for protein without suggesting foods, and not late at night', () => {
    const due = dueNotifications(at('15:05'), s, D, w, n({ proteinG: 30 }));
    expect(due.map((d) => d.kind)).toEqual(['protein_nudge']);
    expect(due[0].body).not.toMatch(/Try/);
    expect(kinds(at('22:30'), n({ proteinG: 30 }))).toEqual([]);
  });

  it('sends target warnings unless turned off', () => {
    expect(kinds(at('13:00'), n({ energyKcal: 1850, proteinG: 100 }))).toEqual(['kcal_close']);
    expect(kinds(at('13:00'), n({ energyKcal: 2100, proteinG: 100, fatG: 70 }))).toEqual(['kcal_over', 'fat_over']);
    expect(kinds(at('13:00'), n({ energyKcal: 2100, proteinG: 100 }), { ...s, notifyTargets: false })).toEqual([]);
  });
});

describe('VAPID subject', () => {
  it('adds mailto: to a bare email and leaves URLs alone', async () => {
    const { normaliseSubject } = await import('../src/services/push.js');
    expect(normaliseSubject('me@example.com')).toBe('mailto:me@example.com');
    expect(normaliseSubject(' mailto:me@example.com ')).toBe('mailto:me@example.com');
    expect(normaliseSubject('https://example.com')).toBe('https://example.com');
  });
});

describe('window closing with protein still to go', () => {
  it('says how much protein is left, without suggesting foods', () => {
    const [n] = dueNotifications(at('19:40'), s, D, w, n2({ proteinG: 100 }));
    expect(n).toMatchObject({ kind: 'window_closing', url: '/' });
    expect(n.body).toBe('You still need 50 g protein before 8:00 pm.');
    const [done] = dueNotifications(at('19:40'), s, D, w, n2({ proteinG: 149 }));
    expect(done).toMatchObject({ url: '/', body: 'Last chance to eat before 8:00 pm.' });
  });
});
function n2(p: Partial<Nutrients>) {
  return { ...emptyNutrients(), ...p };
}
