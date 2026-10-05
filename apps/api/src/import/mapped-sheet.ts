import { kcalToKj, kjToKcal, round } from '@mea/shared';
import type ExcelJS from 'exceljs';
import type { NormalisedFood, RowResult } from './adapter.js';
import {
  columnLetter,
  loadWorkbook,
  parseNumber,
  readTable,
  summariseSheets,
  type CellValue,
  type SheetTable,
} from './spreadsheet.js';

export type MappedField = keyof NormalisedFood;

export interface ColumnSpec {
  field: MappedField;
  required: boolean;
  /** Tried in order against each normalised header; the first pattern that matches any header wins. */
  patterns: RegExp[];
}

export interface ResolvedColumn {
  field: MappedField;
  index: number | null;
  header: string | null;
}

export interface SheetMappingConfig {
  /** Picks the sheet to read; return null to fall back to the first sheet with a matching header. */
  chooseSheet(sheets: ExcelJS.Worksheet[]): ExcelJS.Worksheet | null;
  /** Matches a cell in the header row (used to skip title rows). */
  headerProbe: RegExp;
  columns: ColumnSpec[];
}

const NUMERIC_FIELDS: MappedField[] = ['energyKj', 'energyKcal', 'proteinG', 'fatG', 'carbsG', 'sugarsG', 'fibreG', 'sodiumMg'];

export function resolveColumns(headers: string[], specs: ColumnSpec[]): ResolvedColumn[] {
  return specs.map((spec) => {
    for (const pattern of spec.patterns) {
      const index = headers.findIndex((h) => pattern.test(h));
      if (index >= 0) return { field: spec.field, index, header: headers[index] };
    }
    return { field: spec.field, index: null, header: null };
  });
}

export async function loadMappedTable(file: string, config: SheetMappingConfig) {
  const wb = await loadWorkbook(file);
  const sheets = wb.worksheets;
  const preferred = config.chooseSheet(sheets);
  const candidates = preferred ? [preferred, ...sheets.filter((s) => s !== preferred)] : sheets;
  let table: SheetTable | null = null;
  for (const ws of candidates) {
    table = readTable(ws, config.headerProbe);
    if (table) break;
  }
  if (!table) throw new Error(`No sheet has a header row matching ${config.headerProbe}. Run with --inspect to see the sheets.`);
  const columns = resolveColumns(table.headers, config.columns);
  return { wb, table, columns };
}

export function missingRequired(columns: ResolvedColumn[], specs: ColumnSpec[]): MappedField[] {
  return specs.filter((s) => s.required && columns.find((c) => c.field === s.field)?.index == null).map((s) => s.field);
}

export function mapRow(rowNumber: number, values: CellValue[], columns: ResolvedColumn[]): RowResult {
  const get = (field: MappedField) => {
    const col = columns.find((c) => c.field === field);
    return col?.index == null ? null : values[col.index] ?? null;
  };

  const sourceFoodId = get('sourceFoodId');
  const name = get('name');
  if (sourceFoodId == null || String(sourceFoodId).trim() === '') return { ok: false, rowNumber, reason: 'missing food ID' };
  if (name == null || String(name).trim() === '') return { ok: false, rowNumber, reason: 'missing name' };

  const food: NormalisedFood = {
    sourceFoodId: String(sourceFoodId).trim(),
    name: String(name).replace(/\s+/g, ' ').trim(),
    description: get('description') == null ? null : String(get('description')).trim() || null,
    energyKj: null,
    energyKcal: null,
    proteinG: null,
    fatG: null,
    carbsG: null,
    sugarsG: null,
    fibreG: null,
    sodiumMg: null,
  };

  for (const field of NUMERIC_FIELDS) {
    try {
      const n = parseNumber(get(field));
      if (n != null && n < 0) return { ok: false, rowNumber, reason: `${field} is negative (${n})` };
      (food as unknown as Record<string, number | null>)[field] = n;
    } catch (e) {
      return { ok: false, rowNumber, reason: `${field}: ${(e as Error).message}` };
    }
  }

  // Store both energy units, whichever the source provides
  if (food.energyKj != null && food.energyKcal == null) food.energyKcal = kjToKcal(food.energyKj);
  else if (food.energyKcal != null && food.energyKj == null) food.energyKj = kcalToKj(food.energyKcal);
  if (food.energyKj != null) food.energyKj = round(food.energyKj, 1);

  return { ok: true, rowNumber, food };
}

/** Plain-text inspection report shared by spreadsheet-based adapters. */
export async function inspectReport(file: string, config: SheetMappingConfig, title: string): Promise<string> {
  const { wb, table, columns } = await loadMappedTable(file, config);
  const lines: string[] = [];
  lines.push(`${title}`, `File: ${file}`, '');
  lines.push('Sheets:');
  for (const s of summariseSheets(wb)) {
    lines.push(`  ${s.name === table.sheetName ? '→' : ' '} ${s.name}  (${s.rowCount} rows × ${s.columnCount} cols)`);
  }
  lines.push('', `Reading sheet "${table.sheetName}", header on row ${table.headerRowNumber}, ${table.rows.length} data rows.`, '');
  lines.push('Column mapping (foods column ← file column):');
  const width = Math.max(...columns.map((c) => c.field.length));
  for (const c of columns) {
    const spec = config.columns.find((s) => s.field === c.field)!;
    const src = c.index == null ? (spec.required ? '!! NOT FOUND (required)' : '— not found (optional, left empty)') : `${columnLetter(c.index)}: "${c.header}"`;
    lines.push(`  ${c.field.padEnd(width)} ← ${src}`);
  }
  lines.push(`  ${'energyKcal'.padEnd(width)} ← calculated as energyKj ÷ 4.184 when the file has no kcal column`);

  const used = new Set(columns.map((c) => c.index));
  const unused = table.headers.map((h, i) => ({ h, i })).filter(({ h, i }) => h && !used.has(i));
  lines.push('', `${unused.length} other columns are not imported. First 15:`);
  for (const { h, i } of unused.slice(0, 15)) lines.push(`  ${columnLetter(i)}: ${h}`);

  const missing = missingRequired(columns, config.columns);
  if (missing.length) {
    lines.push('', `!! Missing required columns: ${missing.join(', ')}. The import will refuse to run.`);
    return lines.join('\n');
  }

  lines.push('', 'Sample rows after mapping:');
  let shown = 0;
  let ok = 0;
  const skipped: string[] = [];
  for (const r of table.rows) {
    const res = mapRow(r.rowNumber, r.values, columns);
    if (res.ok) {
      ok++;
      if (shown < 3) {
        shown++;
        const f = res.food;
        const v = (n: number | null) => (n == null ? '—' : n);
        lines.push(
          `  [row ${r.rowNumber}] ${f.sourceFoodId}  ${f.name}`,
          `     ${v(f.energyKj)} kJ / ${v(f.energyKcal)} kcal · P ${v(f.proteinG)} g · F ${v(f.fatG)} g · C ${v(f.carbsG)} g · sugars ${v(f.sugarsG)} g · fibre ${v(f.fibreG)} g · Na ${v(f.sodiumMg)} mg`,
        );
      }
    } else skipped.push(`row ${res.rowNumber}: ${res.reason}`);
  }
  lines.push('', `${ok} rows would import, ${skipped.length} would be skipped.`);
  for (const s of skipped.slice(0, 10)) lines.push(`  ${s}`);
  return lines.join('\n');
}
