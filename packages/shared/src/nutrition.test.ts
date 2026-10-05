import { describe, expect, it } from 'vitest';
import { kjToKcal, kcalToKj, scalePer100g } from './nutrition.js';

describe('energy conversion', () => {
  it('converts kJ to kcal using 4.184', () => {
    expect(kjToKcal(4184)).toBe(1000);
    expect(kjToKcal(1500)).toBe(358.5);
  });
  it('round-trips kcal to kJ', () => {
    expect(kcalToKj(100)).toBe(418.4);
  });
});

describe('scalePer100g', () => {
  it('scales values and keeps nulls', () => {
    const r = scalePer100g(
      { energyKj: 1000, energyKcal: 239, proteinG: 10, fatG: 5, carbsG: null, sugarsG: 0, fibreG: 2, sodiumMg: 401 },
      150,
    );
    expect(r).toEqual({ energyKj: 1500, energyKcal: 358.5, proteinG: 15, fatG: 7.5, carbsG: null, sugarsG: 0, fibreG: 3, sodiumMg: 602 });
  });
});
