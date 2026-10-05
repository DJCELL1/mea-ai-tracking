import type { SettingsDto } from './api.js';
import { localDate, localTime } from './dates.js';
import { kcalToKj, round, type Nutrients } from './nutrition.js';

export type AlertKind = 'kcal_close' | 'kcal_over' | 'protein_over' | 'carbs_over' | 'fat_over' | 'protein_nudge';

export interface DayAlert {
  kind: AlertKind;
  /** warning = getting close / nudge, critical = over a limit, info = over a target that's a minimum (protein). */
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
}

export type TargetSettings = Pick<
  SettingsDto,
  'timezone' | 'kcalTarget' | 'proteinGTarget' | 'carbsGTarget' | 'fatGTarget' | 'closeAlertPct' | 'proteinNudgeTime' | 'proteinNudgePct'
>;

export interface TargetProgress {
  key: 'kcal' | 'protein' | 'carbs' | 'fat';
  eaten: number;
  target: number;
  /** Negative when over. */
  remaining: number;
  /** 0–∞ (1 = exactly on target). */
  ratio: number;
}

export function progress(totals: Nutrients, s: TargetSettings): TargetProgress[] {
  const rows: [TargetProgress['key'], number | null, number][] = [
    ['kcal', totals.energyKcal, s.kcalTarget],
    ['protein', totals.proteinG, s.proteinGTarget],
    ['carbs', totals.carbsG, s.carbsGTarget],
    ['fat', totals.fatG, s.fatGTarget],
  ];
  return rows.map(([key, eaten, target]) => {
    const e = round(eaten ?? 0, key === 'kcal' ? 0 : 1);
    return { key, eaten: e, target, remaining: round(target - e, key === 'kcal' ? 0 : 1), ratio: target > 0 ? e / target : 0 };
  });
}

const fmt = (n: number, d = 0) => n.toLocaleString('en-AU', { maximumFractionDigits: d });

/**
 * In-app alerts for a day. Used by the app (banners) and the server (push, phase 5).
 * - kcal at or above the close threshold (default 90%) → "getting close"
 * - any target exceeded → flagged (protein over is informational: it's a minimum)
 * - protein nudge: viewing today, after the nudge time, below the nudge % of protein
 */
export function computeAlerts(totals: Nutrients, s: TargetSettings, date: string, now = new Date()): DayAlert[] {
  const alerts: DayAlert[] = [];
  const [kcal, protein, carbs, fat] = progress(totals, s);

  if (kcal.target > 0) {
    if (kcal.remaining < 0) {
      const over = -kcal.remaining;
      alerts.push({
        kind: 'kcal_over',
        level: 'critical',
        title: 'Over your energy target',
        message: `${fmt(over)} kcal (${fmt(kcalToKj(over))} kJ) over your ${fmt(kcal.target)} kcal target.`,
      });
    } else if (kcal.ratio * 100 >= s.closeAlertPct) {
      alerts.push({
        kind: 'kcal_close',
        level: 'warning',
        title: 'Getting close',
        message: `${fmt(Math.floor(kcal.ratio * 100))}% of your energy target. ${fmt(kcal.remaining)} kcal (${fmt(kcalToKj(kcal.remaining))} kJ) left today.`,
      });
    }
  }

  for (const [p, label] of [
    [carbs, 'carbs'],
    [fat, 'fat'],
  ] as const) {
    if (p.target > 0 && p.remaining < 0) {
      alerts.push({ kind: `${p.key}_over` as AlertKind, level: 'critical', title: `Over your ${label} target`, message: `${fmt(-p.remaining, 1)} g over your ${fmt(p.target)} g ${label} target.` });
    }
  }
  if (protein.target > 0 && protein.remaining < 0) {
    alerts.push({ kind: 'protein_over', level: 'info', title: 'Protein target passed', message: `${fmt(-protein.remaining, 1)} g over your ${fmt(protein.target)} g protein target.` });
  }

  const isToday = date === localDate(now, s.timezone);
  if (isToday && protein.target > 0 && localTime(now, s.timezone) >= s.proteinNudgeTime && protein.ratio * 100 < s.proteinNudgePct) {
    alerts.push({
      kind: 'protein_nudge',
      level: 'warning',
      title: 'Eat more protein',
      message: `It's after ${s.proteinNudgeTime} and you're at ${fmt(protein.eaten)} g of ${fmt(protein.target)} g protein (${fmt(Math.floor(protein.ratio * 100))}%). ${fmt(protein.remaining)} g to go.`,
    });
  }

  return alerts;
}
