import ExcelJS from 'exceljs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** A small workbook shaped like the MyFoodData spreadsheet (title rows, "NULL" strings, serving columns). */
export async function makeMyFoodDataFixture(rows: (string | number)[][] = DEFAULT_ROWS): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SR Legacy and FNDDS');
  ws.addRow(['Data Provided By MyFoodData.com']);
  ws.addRow(['Click "File" then "Download as"']);
  ws.addRow(['If you have a google account click "File" then "Make a Copy"']);
  ws.addRow([
    'ID', 'name', 'Food Group', 'Calories', 'Fat (g)', 'Protein (g)', 'Carbohydrate (g)', 'Sugars (g)', 'Fiber (g)',
    'Net-Carbs (g)', 'Sodium (mg)', 'Serving Weight 1 (g)', 'Serving Description 1 (g)', 'Serving Weight 2 (g)', 'Serving Description 2 (g)',
  ]);
  for (const r of rows) ws.addRow(r);
  wb.addWorksheet('Read Me').addRow(['All serving sizes are in 100 grams.']);
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'mfd-')), 'MyFoodData-Nutrition-Facts-SpreadSheet-Release-1-4.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

export const DEFAULT_ROWS: (string | number)[][] = [
  [171287, 'Eggs Whole Raw', 'Dairy and Egg Products', 143, 9.51, 12.56, 0.72, 0.37, 0, 0.72, 142, 50, '1 large', 44, '1 medium'],
  [168917, 'Oatmeal Cooked', 'NULL', 71, 1.52, 2.54, 12, 0.27, 1.7, 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL'],
];
