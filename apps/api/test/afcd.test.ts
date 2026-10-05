import { describe, expect, it } from 'vitest';
import { afcd } from '../src/import/sources/afcd.js';
import { partitionRows } from '../src/import/upsert.js';
import { makeAfcdFixture } from './fixtures/make-afcd.js';

describe('AFCD adapter', () => {
  it('reads the per-100 g sheet and maps the expected columns', async () => {
    const file = await makeAfcdFixture();
    const report = await afcd.inspect(file);
    expect(report).toContain('Reading sheet "All solids & liquids per 100 g", header on row 3');
    expect(report).toContain('energyKj     ← E: "Energy with dietary fibre, equated (kJ)"');
    expect(report).toContain('carbsG       ← L: "Available carbohydrate, with sugar alcohols (g)"');
    expect(report).toContain('sodiumMg     ← N: "Sodium (Na) (mg)"');
    expect(report).toContain('3 rows would import, 2 would be skipped.');
  });

  it('converts kJ to kcal, keeps blanks as null and skips bad rows', async () => {
    const file = await makeAfcdFixture();
    const { version, rows } = await afcd.read(file);
    expect(version).toBe('Release 3');
    const { foods, skipped } = partitionRows(rows);

    expect(foods.map((f) => f.sourceFoodId)).toEqual(['F002258', 'F003170', 'F005633']);
    expect(foods[1]).toMatchObject({
      name: 'Chicken, breast, lean, grilled',
      energyKj: 678,
      energyKcal: 162.0,
      proteinG: 31,
      fatG: 3.4,
      carbsG: 0,
      sugarsG: 0,
      fibreG: 0,
      sodiumMg: 59,
    });
    expect(foods[2].sodiumMg).toBeNull();
    expect(skipped.map((s) => s.reason)).toEqual(['energyKj: not a number: "abc"', 'missing food ID']);
  });

  it('refuses a file without the required columns', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('per 100 g').addRow(['Public Food Key', 'Food Name']);
    const file = (await makeAfcdFixture()).replace('.xlsx', '-bad.xlsx');
    await wb.xlsx.writeFile(file);
    await expect(afcd.read(file)).rejects.toThrow(/missing required columns: energyKj, proteinG, fatG, carbsG/);
  });
});
