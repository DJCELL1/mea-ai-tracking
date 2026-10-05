import path from 'node:path';
import { round } from '@mea/shared';
import type { FoodSourceAdapter } from '../adapter.js';
import { inspectReport, loadMappedTable, mapRow, missingRequired, type SheetMappingConfig } from '../mapped-sheet.js';
import { parseNumber } from '../spreadsheet.js';

const MAX_SERVINGS = 9;

/**
 * MyFoodData nutrition facts spreadsheet (US data from USDA SR Legacy and FNDDS).
 * Per 100 g, energy in kcal only, missing values written as "NULL".
 *
 * US "Carbohydrate" is total carbohydrate by difference and includes fibre, whereas
 * AFCD "available carbohydrate" excludes it. To keep carbs comparable across sources
 * we store Net-Carbs (carbohydrate − fibre), falling back to computing it.
 */
export const myFoodDataConfig: SheetMappingConfig = {
  chooseSheet: (sheets) => sheets.find((s) => /sr legacy|fndds/i.test(s.name)) ?? null,
  headerProbe: /^food group$/i,
  columns: [
    { field: 'sourceFoodId', required: true, patterns: [/^id$/i] },
    { field: 'name', required: true, patterns: [/^name$/i] },
    { field: 'description', required: false, patterns: [/^food group$/i] },
    { field: 'energyKcal', required: true, patterns: [/^calories$/i] },
    { field: 'proteinG', required: true, patterns: [/^protein \(g\)$/i] },
    { field: 'fatG', required: true, patterns: [/^fat \(g\)$/i] },
    { field: 'carbsG', required: true, patterns: [/^net-carbs \(g\)$/i] },
    { field: 'sugarsG', required: false, patterns: [/^sugars \(g\)$/i] },
    { field: 'fibreG', required: false, patterns: [/^fiber \(g\)$/i] },
    { field: 'sodiumMg', required: false, patterns: [/^sodium \(mg\)$/i] },
  ],
  finish(food, cell) {
    if (food.carbsG == null) {
      const total = parseNumber(cell(/^carbohydrate \(g\)$/i));
      if (total != null) food.carbsG = round(Math.max(0, total - (food.fibreG ?? 0)), 2);
    }
    if (food.description === 'NULL') food.description = null;

    const servings: { label: string; grams: number }[] = [];
    for (let i = 1; i <= MAX_SERVINGS; i++) {
      const grams = parseNumber(cell(new RegExp(`^serving weight ${i} \\(g\\)$`, 'i')));
      const label = cell(new RegExp(`^serving description ${i}`, 'i'));
      if (grams && grams > 0 && typeof label === 'string' && label.trim() && label.trim().toUpperCase() !== 'NULL') {
        servings.push({ label: label.trim(), grams: round(grams, 1) });
      }
    }
    food.servings = servings;
  },
  notes: [
    'carbsG uses Net-Carbs (carbohydrate − fibre) to match AFCD "available carbohydrate"',
    'servings     ← "Serving Weight N (g)" + "Serving Description N", N = 1–9',
  ],
};

export const myFoodData: FoodSourceAdapter = {
  code: 'myfooddata',
  name: 'MyFoodData (USDA SR Legacy & FNDDS)',

  inspect: (file) => inspectReport(file, myFoodDataConfig, 'MyFoodData import — inspection (nothing is written)'),

  async read(file) {
    const { table, columns, ctx } = await loadMappedTable(file, myFoodDataConfig);
    const missing = missingRequired(columns, myFoodDataConfig.columns);
    if (missing.length) throw new Error(`MyFoodData file is missing required columns: ${missing.join(', ')}. Run with --inspect.`);
    const release = path.basename(file).match(/release[\s-]*([\d.-]+\d)/i);
    return {
      version: release ? `Release ${release[1].replace(/-/g, '.')}` : path.basename(file),
      rows: table.rows.map((r) => mapRow(r.rowNumber, r.values, ctx)),
    };
  },
};
