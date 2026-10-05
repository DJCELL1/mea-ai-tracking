import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createDb, createPool } from '../db/client.js';
import { partitionRows, importFoods } from './upsert.js';
import { sources } from './sources/index.js';

const USAGE = `Usage:
  npm run import:foods -- --source <code> --file <path> [--inspect | --dry-run]

  --inspect   show sheets, header row, column mapping and sample rows (writes nothing)
  --dry-run   map and validate every row and report counts (writes nothing)

Sources: ${Object.keys(sources).join(', ')}`;

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    file: { type: 'string' },
    inspect: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || !values.source || !values.file) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const adapter = sources[values.source];
if (!adapter) {
  console.error(`Unknown source "${values.source}".\n\n${USAGE}`);
  process.exit(1);
}
// npm runs workspace scripts from apps/api; resolve relative paths from where the command was typed
const file = path.resolve(process.env.INIT_CWD ?? process.cwd(), values.file);
if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

if (values.inspect) {
  console.log(await adapter.inspect(file));
} else if (values['dry-run']) {
  const { version, rows } = await adapter.read(file);
  const { foods, skipped } = partitionRows(rows);
  console.log(`Dry run (${adapter.name}, ${version ?? 'unknown version'}): ${rows.length} rows read, ${foods.length} would be imported, ${skipped.length} skipped.`);
  for (const s of skipped.slice(0, 20)) console.log(`  row ${s.rowNumber}: ${s.reason}`);
  if (skipped.length > 20) console.log(`  …and ${skipped.length - 20} more`);
} else {
  const pool = createPool();
  try {
    const started = Date.now();
    const r = await importFoods(createDb(pool), adapter, file);
    console.log(`Imported ${adapter.name} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    console.log(`  ${r.rowsRead} rows read · ${r.inserted} new · ${r.updated} updated · ${r.skipped.length} skipped`);
    for (const s of r.skipped.slice(0, 20)) console.log(`  row ${s.rowNumber}: ${s.reason}`);
  } finally {
    await pool.end();
  }
}
