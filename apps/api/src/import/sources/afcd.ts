import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { FoodSourceAdapter } from '../adapter.js';
import { inspectReport, loadMappedTable, mapRow, missingRequired, type SheetMappingConfig } from '../mapped-sheet.js';
import { loadWorkbook, readTable } from '../spreadsheet.js';

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

/** The AFCD "Food Details" file saved next to the nutrient file, if there is one. */
export function findDetailsFile(nutrientFile: string): string | null {
  const dir = path.dirname(nutrientFile);
  const match = readdirSync(dir).find((f) => /food details/i.test(f) && /\.xlsx$/i.test(f) && !f.startsWith('~$'));
  return match ? path.join(dir, match) : null;
}

/** Public Food Key → Food Description, from the Food Details file. */
export async function loadDescriptions(detailsFile: string): Promise<Map<string, string>> {
  const wb = await loadWorkbook(detailsFile);
  const map = new Map<string, string>();
  for (const ws of wb.worksheets) {
    const table = readTable(ws, /^public food key$/i);
    if (!table) continue;
    const key = table.headers.findIndex((h) => /^public food key$/i.test(h));
    const desc = table.headers.findIndex((h) => /^food description$/i.test(h));
    if (desc < 0) continue;
    for (const r of table.rows) {
      const k = r.values[key];
      const d = r.values[desc];
      if (k != null && typeof d === 'string' && d.trim()) map.set(String(k).trim(), d.replace(/\s+/g, ' ').trim());
    }
    break;
  }
  return map;
}

/** AFCD config plus descriptions from the Food Details file when it is present. */
async function configFor(file: string): Promise<{ config: SheetMappingConfig; detailsFile: string | null }> {
  const detailsFile = findDetailsFile(file);
  if (!detailsFile) return { config: afcdConfig, detailsFile };
  const descriptions = await loadDescriptions(detailsFile);
  return {
    detailsFile,
    config: {
      ...afcdConfig,
      finish: (food) => {
        food.description ??= descriptions.get(food.sourceFoodId) ?? null;
      },
      notes: [`description  ← "Food Description" from ${path.basename(detailsFile)} (${descriptions.size} foods)`],
    },
  };
}

export const afcd: FoodSourceAdapter = {
  code: 'afcd',
  name: 'Australian Food Composition Database (FSANZ)',

  async inspect(file) {
    const { config, detailsFile } = await configFor(file);
    const report = await inspectReport(file, config, 'AFCD import — inspection (nothing is written)');
    return detailsFile ? report : `${report}\n\nTip: save the AFCD "Food Details" file in the same folder to also import food descriptions.`;
  },

  async read(file) {
    const { config } = await configFor(file);
    const { table, columns, ctx } = await loadMappedTable(file, config);
    const missing = missingRequired(columns, config.columns);
    if (missing.length) throw new Error(`AFCD file is missing required columns: ${missing.join(', ')}. Run with --inspect.`);
    const release = path.basename(file).match(/release\s*(\d+)/i);
    return {
      version: release ? `Release ${release[1]}` : path.basename(file),
      rows: table.rows.map((r) => mapRow(r.rowNumber, r.values, ctx)),
    };
  },
};
