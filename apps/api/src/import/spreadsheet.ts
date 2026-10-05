import ExcelJS from 'exceljs';

/** A sheet read into header text + plain cell values. */
export interface SheetTable {
  sheetName: string;
  /** 1-based row number of the header row in the original sheet. */
  headerRowNumber: number;
  headers: string[];
  /** Data rows below the header; `rowNumber` is 1-based in the original sheet. */
  rows: { rowNumber: number; values: CellValue[] }[];
}

export type CellValue = string | number | boolean | Date | null;

export interface SheetSummary {
  name: string;
  rowCount: number;
  columnCount: number;
}

export async function loadWorkbook(file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file)) await wb.csv.readFile(file);
  else await wb.xlsx.readFile(file);
  return wb;
}

export function summariseSheets(wb: ExcelJS.Workbook): SheetSummary[] {
  return wb.worksheets.map((ws) => ({ name: ws.name, rowCount: ws.actualRowCount, columnCount: ws.actualColumnCount }));
}

/** Collapse line breaks and repeated spaces, which AFCD headers contain. */
export function normaliseHeader(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Unwrap ExcelJS rich text, formula results and hyperlinks into plain values. */
export function plainValue(v: ExcelJS.CellValue): CellValue {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return plainValue(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if ('error' in v) return null;
  }
  return String(v);
}

/**
 * Read a sheet as a table. The header row is the first row (within the first
 * `scanRows`) containing a cell that matches `headerProbe` — this skips title
 * rows above the real header.
 */
export function readTable(ws: ExcelJS.Worksheet, headerProbe: RegExp, scanRows = 20): SheetTable | null {
  let headerRowNumber = 0;
  for (let r = 1; r <= Math.min(scanRows, ws.rowCount); r++) {
    const row = ws.getRow(r);
    let found = false;
    row.eachCell((cell) => {
      const v = plainValue(cell.value);
      if (typeof v === 'string' && headerProbe.test(normaliseHeader(v))) found = true;
    });
    if (found) {
      headerRowNumber = r;
      break;
    }
  }
  if (!headerRowNumber) return null;

  const headerRow = ws.getRow(headerRowNumber);
  const width = headerRow.cellCount;
  const headers: string[] = [];
  for (let c = 1; c <= width; c++) {
    const v = plainValue(headerRow.getCell(c).value);
    headers.push(v == null ? '' : normaliseHeader(String(v)));
  }

  const rows: SheetTable['rows'] = [];
  for (let r = headerRowNumber + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const values: CellValue[] = [];
    for (let c = 1; c <= width; c++) values.push(plainValue(row.getCell(c).value));
    rows.push({ rowNumber: r, values });
  }
  return { sheetName: ws.name, headerRowNumber, headers, rows };
}

/** Excel column letter for a 0-based index (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Parse a nutrient cell. Blank/'-'/'NA'/'NULL' → null (not measured); 'tr'/'trace' → 0;
 * '<0.1' → 0. Throws on anything else that isn't a number.
 */
export function parseNumber(v: CellValue): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') throw new Error(`not a number: ${String(v)}`);
  const s = v.trim().toLowerCase();
  if (s === '' || s === '-' || s === 'na' || s === 'n/a' || s === 'null') return null;
  if (s === 'tr' || s === 'trace' || s.startsWith('<')) return 0;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error(`not a number: "${v}"`);
  return n;
}
