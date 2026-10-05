import { describe, expect, it } from 'vitest';
import type { FoodDto } from '@mea/shared';
import { bestCombo, portionFor, rankFillOptions } from '../src/services/fill.js';
import type { ProteinSuggestion } from '../src/services/suggestions.js';

const food = (id: number, name: string, proteinG: number, energyKcal: number, servings: FoodDto['servings'] = []): FoodDto => ({
  id,
  name,
  description: null,
  sourceCode: 'afcd',
  isMine: false,
  recipeId: null,
  servings,
  energyKj: Math.round(energyKcal * 4.184),
  energyKcal,
  proteinG,
  fatG: 0,
  carbsG: 0,
  sugarsG: null,
  fibreG: null,
  sodiumMg: null,
});
const cand = (f: FoodDto, grams: number, extra: Partial<ProteinSuggestion> = {}): ProteinSuggestion => ({
  food: f,
  grams,
  servingId: null,
  servingQty: null,
  proteinG: 0,
  energyKcal: 0,
  fromHistory: false,
  ...extra,
});

const chicken = food(1, 'Chicken breast, grilled', 30, 143);
const yoghurt = food(2, 'Protein yoghurt', 10, 54, [{ id: 20, label: '1 tub', grams: 170, isDefault: true, imported: false }]);
const nuts = food(3, 'Peanuts', 25, 600);

describe('portionFor', () => {
  it('sizes grams to the protein gap within half to double the usual amount', () => {
    expect(portionFor(cand(chicken, 150), 45)).toMatchObject({ grams: 150 });
    expect(portionFor(cand(chicken, 150), 200)).toMatchObject({ grams: 300 }); // capped at 2× usual
    expect(portionFor(cand(chicken, 150), 5)).toMatchObject({ grams: 75 }); // at least ½ usual
  });
  it('uses servings in half steps', () => {
    expect(portionFor(cand(yoghurt, 170, { servingId: 20, servingQty: 1 }), 34)).toMatchObject({ servingQty: 2, grams: 340, servingLabel: '1 tub' });
  });
});

describe('rankFillOptions', () => {
  it('prefers foods that close the gap within the kcal left', () => {
    const r = rankFillOptions([cand(nuts, 100, { fromHistory: true }), cand(chicken, 150), cand(yoghurt, 170, { servingId: 20, servingQty: 1 })], 40, 400);
    expect(r.map((o) => o.food.name)).toEqual(['Chicken breast, grilled', 'Protein yoghurt', 'Peanuts']);
    expect(r[0]).toMatchObject({ grams: 135, proteinG: 40.5, energyKcal: 193, covers: 1, fitsKcal: true });
    expect(r[2].fitsKcal).toBe(false);
  });
});

describe('bestCombo', () => {
  const cands = [cand(chicken, 150), cand(yoghurt, 170, { servingId: 20, servingQty: 1 }), cand(nuts, 100)];
  it('pairs two foods when one portion can\'t cover a big gap', () => {
    const [first] = rankFillOptions(cands, 110, 900);
    expect(first.covers).toBeLessThan(0.9);
    const combo = bestCombo(cands, 110, 900, first)!;
    expect(combo.items.map((i) => i.food.name)).toEqual(['Chicken breast, grilled', 'Protein yoghurt']);
    // 300 g chicken (90 g) + 1 tub yoghurt (17 g); servings round to half steps
    expect(combo).toMatchObject({ proteinG: 107, energyKcal: 521, covers: 0.97, fitsKcal: true });
  });
  it('is not offered when one food already covers it', () => {
    const [first] = rankFillOptions(cands, 40, 900);
    expect(bestCombo(cands, 40, 900, first)).toBeNull();
  });
});
