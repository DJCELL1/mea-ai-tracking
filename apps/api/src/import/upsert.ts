import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/client.js';
import { foods, foodSources, importRuns } from '../db/schema.js';
import type { FoodSourceAdapter, NormalisedFood, RowResult } from './adapter.js';

export interface ImportSummary {
  rowsRead: number;
  inserted: number;
  updated: number;
  skipped: { rowNumber: number; reason: string }[];
}

const BATCH_SIZE = 500;

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/** Split rows into importable foods and skips; a repeated food ID keeps the last row. */
export function partitionRows(rows: RowResult[]) {
  const byId = new Map<string, NormalisedFood>();
  const skipped: ImportSummary['skipped'] = [];
  for (const r of rows) {
    if (!r.ok) skipped.push({ rowNumber: r.rowNumber, reason: r.reason });
    else {
      if (byId.has(r.food.sourceFoodId)) skipped.push({ rowNumber: r.rowNumber, reason: `duplicate food ID ${r.food.sourceFoodId} (earlier row replaced)` });
      byId.set(r.food.sourceFoodId, r.food);
    }
  }
  return { foods: [...byId.values()], skipped };
}

export async function ensureSource(db: Db, code: string, name: string, version: string | null) {
  const [row] = await db
    .insert(foodSources)
    .values({ code, name, version })
    .onConflictDoUpdate({ target: foodSources.code, set: { name, version } })
    .returning({ id: foodSources.id });
  return row.id;
}

/**
 * Insert new foods and update existing ones matched on (source, source food ID).
 * Foods no longer in the file are left alone so past log entries keep working.
 */
export async function importFoods(db: Db, adapter: FoodSourceAdapter, file: string): Promise<ImportSummary> {
  const { version, rows } = await adapter.read(file);
  const { foods: items, skipped } = partitionRows(rows);
  const fileSha256 = await sha256File(file);

  return db.transaction(async (tx) => {
    const sourceId = await ensureSource(tx as unknown as Db, adapter.code, adapter.name, version);
    const [run] = await tx
      .insert(importRuns)
      .values({ sourceId, fileName: path.basename(file), fileSha256, rowsRead: rows.length })
      .returning({ id: importRuns.id });

    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE).map((f) => ({ ...f, sourceId }));
      const result = await tx
        .insert(foods)
        .values(batch)
        .onConflictDoUpdate({
          target: [foods.sourceId, foods.sourceFoodId],
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            energyKj: sql`excluded.energy_kj`,
            energyKcal: sql`excluded.energy_kcal`,
            proteinG: sql`excluded.protein_g`,
            fatG: sql`excluded.fat_g`,
            carbsG: sql`excluded.carbs_g`,
            sugarsG: sql`excluded.sugars_g`,
            fibreG: sql`excluded.fibre_g`,
            sodiumMg: sql`excluded.sodium_mg`,
            updatedAt: sql`now()`,
          },
        })
        // xmax = 0 only for freshly inserted rows
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const r of result) r.inserted ? inserted++ : updated++;
    }

    await tx
      .update(importRuns)
      .set({ inserted, updated, skipped: skipped.length, finishedAt: new Date() })
      .where(eq(importRuns.id, run.id));

    return { rowsRead: rows.length, inserted, updated, skipped };
  });
}
