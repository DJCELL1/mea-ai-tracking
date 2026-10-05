import { describe, expect, it } from 'vitest';
import { computeAlerts, progress, type TargetSettings } from './alerts.js';
import { emptyNutrients, type Nutrients } from './nutrition.js';

const s: TargetSettings = {
  timezone: 'Australia/Sydney',
  kcalTarget: 2000,
  proteinGTarget: 150,
  carbsGTarget: 200,
  fatGTarget: 60,
  closeAlertPct: 90,
  proteinNudgeTime: '15:00',
  proteinNudgePct: 50,
};
const day = (n: Partial<Nutrients>): Nutrients => ({ ...emptyNutrients(), ...n });
const D = '2026-10-05';
const at = (hhmm: string) => new Date(`${D}T${hhmm}:00+11:00`); // AEDT

describe('computeAlerts', () => {
  it('stays quiet when under 90%', () => {
    expect(computeAlerts(day({ energyKcal: 1700, proteinG: 120 }), s, D, at('12:00'))).toEqual([]);
  });

  it('warns at 90% of kcal and flags going over', () => {
    const close = computeAlerts(day({ energyKcal: 1800, proteinG: 120 }), s, D, at('12:00'));
    expect(close.map((a) => a.kind)).toEqual(['kcal_close']);
    expect(close[0].message).toContain('200 kcal (837 kJ) left');

    const over = computeAlerts(day({ energyKcal: 2150, proteinG: 120, carbsG: 210, fatG: 61.5 }), s, D, at('12:00'));
    expect(over.map((a) => [a.kind, a.level])).toEqual([
      ['kcal_over', 'critical'],
      ['carbs_over', 'critical'],
      ['fat_over', 'critical'],
    ]);
    expect(over[0].message).toContain('150 kcal');
  });

  it('treats going over protein as information', () => {
    expect(computeAlerts(day({ energyKcal: 1000, proteinG: 160 }), s, D, at('12:00'))).toMatchObject([{ kind: 'protein_over', level: 'info' }]);
  });

  it('nudges for protein only after the nudge time, only today, only when below the %', () => {
    const low = day({ energyKcal: 900, proteinG: 40 });
    expect(computeAlerts(low, s, D, at('14:59'))).toEqual([]);
    expect(computeAlerts(low, s, D, at('15:00')).map((a) => a.kind)).toEqual(['protein_nudge']);
    expect(computeAlerts(low, s, '2026-10-04', at('16:00'))).toEqual([]);
    expect(computeAlerts(day({ proteinG: 80 }), s, D, at('16:00'))).toEqual([]);
  });

  it('reports progress and remaining', () => {
    expect(progress(day({ energyKcal: 2100.4, proteinG: 75 }), s).slice(0, 2)).toEqual([
      { key: 'kcal', eaten: 2100, target: 2000, remaining: -100, ratio: 1.05 },
      { key: 'protein', eaten: 75, target: 150, remaining: 75, ratio: 0.5 },
    ]);
  });
});
