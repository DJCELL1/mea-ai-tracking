import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createDb, createPool, type Db } from './client.js';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool();
  try {
    await runMigrations(createDb(pool));
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}
