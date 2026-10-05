import { fastingStatus, localDate, round, windowsFrom, type FoodDto } from '@mea/shared';
import type { Db } from '../db/client.js';
import { overridesBetween } from './fasting.js';
import { dayLog } from './log.js';
import { getSettings } from './settings.js';
import { proteinSuggestions, type ProteinSuggestion } from './suggestions.js';

export interface FillOption {
  food: FoodDto;
  grams: number;
  servingId: number | null;
  servingQty: number | null;
  servingLabel: string | null;
  proteinG: number;
  energyKcal: number;
  energyKj: number;
  /** Share of the protein gap this portion covers (0–1). */
  covers: number;
  fitsKcal: boolean;
  fromHistory: boolean;
}

export interface FillCombo {
  items: FillOption[];
  proteinG: number;
  energyKcal: number;
  covers: number;
  fitsKcal: boolean;
}

export interface FillResponse {
  date: string;
  proteinLeftG: number;
  kcalLeft: number;
  /** Minutes until today's eating window closes, if it's open now. */
  windowClosesInMin: number | null;
  windowOpen: boolean;
  options: FillOption[];
  /** When no single portion covers the gap: the best pair of two foods. */
  combo: FillCombo | null;
}

const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);
const roundHalf = (q: number) => Math.max(0.5, Math.round(q * 2) / 2);

/**
 * Size a portion of a candidate to cover `needG` protein, keeping it realistic:
 * between half and double your usual amount (servings in steps of ½, grams in steps of 5 g).
 */
export function portionFor(c: ProteinSuggestion, needG: number) {
  const perG = (c.food.proteinG ?? 0) / 100;
  if (perG <= 0) return null;
  const serving = c.servingId ? c.food.servings.find((s) => s.id === c.servingId) : undefined;
  if (serving) {
    const usualQty = c.servingQty ?? 1;
    const qty = Math.min(Math.max(roundHalf(needG / (perG * serving.grams)), roundHalf(usualQty / 2)), Math.max(3, usualQty * 2));
    return { grams: round(serving.grams * qty, 1), servingId: serving.id, servingQty: qty, servingLabel: serving.label };
  }
  const usual = c.grams || 100;
  const grams = Math.min(Math.max(round5(needG / perG), round5(usual / 2)), Math.min(500, Math.max(250, usual * 2)));
  return { grams, servingId: null, servingQty: null, servingLabel: null };
}

function toOption(c: ProteinSuggestion, need: number, kcalLeft: number): (FillOption & { score: number }) | null {
  const p = portionFor(c, need);
  if (!p) return null;
  const proteinG = round(((c.food.proteinG ?? 0) * p.grams) / 100, 1);
  const energyKcal = Math.round(((c.food.energyKcal ?? 0) * p.grams) / 100);
  const energyKj = Math.round(((c.food.energyKj ?? 0) * p.grams) / 100);
  const covers = Math.min(1, proteinG / need);
  const fitsKcal = energyKcal <= Math.max(0, kcalLeft);
  const density = energyKcal > 0 ? (proteinG * 4) / energyKcal : 0;
  const score = (fitsKcal ? 2 : 0) + covers + density * 0.6 + (c.fromHistory ? 0.25 : 0);
  return { food: c.food, ...p, proteinG, energyKcal, energyKj, covers: round(covers, 2), fitsKcal, fromHistory: c.fromHistory, score };
}

/**
 * If the best single portion leaves more than 10% of the gap, pair it with a second food sized
 * for what's left, choosing the pair that covers most within the kcal left.
 */
export function bestCombo(candidates: ProteinSuggestion[], proteinLeftG: number, kcalLeft: number, first: FillOption | undefined): FillCombo | null {
  const need = Math.max(1, proteinLeftG);
  if (!first || first.covers >= 0.9) return null;
  const rest = need - first.proteinG;
  let best: FillCombo | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (c.food.id === first.food.id) continue;
    const o = toOption(c, rest, kcalLeft - first.energyKcal);
    if (!o) continue;
    const { score: _s, ...second } = o;
    const proteinG = round(first.proteinG + second.proteinG, 1);
    const energyKcal = first.energyKcal + second.energyKcal;
    const covers = Math.min(1, proteinG / need);
    const fitsKcal = energyKcal <= Math.max(0, kcalLeft);
    const score = (fitsKcal ? 2 : 0) + covers * 2 - energyKcal / 2000;
    if (score > bestScore) {
      bestScore = score;
      best = { items: [first, second], proteinG, energyKcal, covers: round(covers, 2), fitsKcal };
    }
  }
  return best && best.covers > first.covers ? best : null;
}

/** Rank portions: close the protein gap within the kcal left, then protein per kcal, then foods you eat. */
export function rankFillOptions(candidates: ProteinSuggestion[], proteinLeftG: number, kcalLeft: number, limit = 5): FillOption[] {
  const need = Math.max(1, proteinLeftG);
  const options: (FillOption & { score: number })[] = [];
  for (const c of candidates) {
    const o = toOption(c, need, kcalLeft);
    if (o) options.push(o);
  }
  return options
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _s, ...o }) => o);
}

export async function fillSuggestions(db: Db, userId: number, now = new Date()): Promise<FillResponse> {
  const s = await getSettings(db, userId);
  const date = localDate(now, s.timezone);
  const day = await dayLog(db, userId, date);
  const proteinLeftG = Math.max(0, round(s.proteinGTarget - (day.totals.proteinG ?? 0), 1));
  const kcalLeft = Math.round(s.kcalTarget - (day.totals.energyKcal ?? 0));
  const windows = windowsFrom(date, 1, s, await overridesBetween(db, userId, date, date));
  const status = fastingStatus(now, windows);
  const windowOpen = status.state === 'eating';
  const candidates = proteinLeftG > 0 ? await proteinSuggestions(db, userId, 15) : [];
  const options = rankFillOptions(candidates, proteinLeftG, kcalLeft);
  return {
    date,
    proteinLeftG,
    kcalLeft,
    windowOpen,
    windowClosesInMin: windowOpen && status.changesAt ? Math.max(0, Math.round((status.changesAt.getTime() - now.getTime()) / 60_000)) : null,
    options,
    combo: bestCombo(candidates, proteinLeftG, kcalLeft, options[0]),
  };
}
