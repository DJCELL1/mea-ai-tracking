import ExcelJS from 'exceljs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Build a small workbook shaped like the AFCD nutrient file: title rows above the
 * header, line breaks inside headers, a liquids sheet, blanks, and extra columns.
 */
export async function makeAfcdFixture(rows: (string | number | null)[][] = DEFAULT_ROWS): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const header = [
    'Public Food Key',
    'Classification',
    'Derivation',
    'Food Name',
    'Energy with dietary fibre, equated \n(kJ)',
    'Energy, without dietary fibre, equated \n(kJ)',
    'Moisture (water) \n(g)',
    'Protein \n(g)',
    'Fat, total \n(g)',
    'Total dietary fibre \n(g)',
    'Total sugars (g)',
    'Available carbohydrate, with sugar alcohols \n(g)',
    'Available carbohydrate, without sugar alcohols \n(g)',
    'Sodium (Na) \n(mg)',
  ];

  const liquids = wb.addWorksheet('Liquids only per 100 mL');
  liquids.addRow(['Liquids']);
  liquids.addRow(header);

  const solids = wb.addWorksheet('All solids & liquids per 100 g');
  solids.addRow(['Australian Food Composition Database - Release 3']);
  solids.addRow([]);
  solids.addRow(header);
  for (const r of rows) solids.addRow(r);

  const dir = mkdtempSync(path.join(tmpdir(), 'afcd-'));
  const file = path.join(dir, 'AFCD Release 3 - Nutrient profiles.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

//               key        class  deriv  name                        kJ    kJnoF moist  P     F     fib  sug   carb  carbNoSA Na
export const DEFAULT_ROWS: (string | number | null)[][] = [
  ['F002258', 13, 'A', 'Apple, red delicious, with skin, raw', 239, 230, 85, 0.3, 0.1, 2.4, 11.4, 12.1, 12.1, 1],
  ['F003170', 13, 'A', 'Chicken, breast, lean, grilled', 678, 678, 64, 31.0, 3.4, 0, 0, 0, 0, 59],
  ['F005633', 13, 'A', 'Oats, rolled, uncooked', 1580, 1530, 9, 11.0, 8.3, 9.6, 1.2, 56.6, 56.6, null],
  ['F009999', 13, 'A', 'Broken row', 'abc', 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [null, 13, 'A', 'No key', 100, 100, 0, 0, 0, 0, 0, 0, 0, 0],
];
