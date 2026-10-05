import path from 'node:path';
import type { FoodSourceAdapter } from '../adapter.js';
import { inspectReport, loadMappedTable, mapRow, missingRequired, type SheetMappingConfig } from '../mapped-sheet.js';

/**
 * Australian Food Composition Database (FSANZ), nutrient profile Excel file.
 * Patterns are tried in order, so the preferred column comes first and looser
 * fallbacks cover header wording that changes between releases.
 */
export const afcdConfig: SheetMappingConfig = {
  chooseSheet: (sheets) =>
    // Prefer the per-100 g sheet over the per-100 mL liquids sheet
    sheets.find((s) => /100\s*g/i.test(s.name) && !/100\s*ml/i.test(s.name)) ?? null,
  headerProbe: /^public food key$/i,
  columns: [
    { field: 'sourceFoodId', required: true, patterns: [/^public food key$/i] },
    { field: 'name', required: true, patterns: [/^food name$/i, /^name$/i] },
    { field: 'description', required: false, patterns: [/^food description$/i, /^description$/i] },
    {
      field: 'energyKj',
      required: true,
      patterns: [
        /^energy with dietary fibre, equated \(kj\)$/i,
        /^energy,? with dietary fibre.*\(kj\)/i,
        /^energy.*\(kj\)/i,
      ],
    },
    { field: 'proteinG', required: true, patterns: [/^protein \(g\)$/i, /^protein\b.*\(g\)/i] },
    { field: 'fatG', required: true, patterns: [/^fat,? total \(g\)$/i, /^total fat \(g\)$/i, /^fat\b.*\(g\)/i] },
    {
      field: 'carbsG',
      required: true,
      patterns: [
        /^available carbohydrate,? with sugar alcohols \(g\)$/i,
        /^available carbohydrate.*\(g\)/i,
        /^carbohydrate.*\(g\)/i,
      ],
    },
    { field: 'sugarsG', required: false, patterns: [/^total sugars \(g\)$/i, /^sugars?,? total \(g\)/i, /sugars.*\(g\)/i] },
    { field: 'fibreG', required: false, patterns: [/^total dietary fibre \(g\)$/i, /^dietary fibre.*\(g\)/i, /fibre.*\(g\)/i] },
    { field: 'sodiumMg', required: false, patterns: [/^sodium \(na\) \(mg\)$/i, /^sodium.*\(mg\)/i] },
  ],
};

export const afcd: FoodSourceAdapter = {
  code: 'afcd',
  name: 'Australian Food Composition Database (FSANZ)',

  inspect: (file) => inspectReport(file, afcdConfig, 'AFCD import — inspection (nothing is written)'),

  async read(file) {
    const { table, columns } = await loadMappedTable(file, afcdConfig);
    const missing = missingRequired(columns, afcdConfig.columns);
    if (missing.length) throw new Error(`AFCD file is missing required columns: ${missing.join(', ')}. Run with --inspect.`);
    const release = path.basename(file).match(/release\s*(\d+)/i);
    return {
      version: release ? `Release ${release[1]}` : path.basename(file),
      rows: table.rows.map((r) => mapRow(r.rowNumber, r.values, columns)),
    };
  },
};
