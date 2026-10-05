import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env.js';
import * as schema from './schema.js';

export function createPool(url = env.databaseUrl) {
  return new pg.Pool({
    connectionString: url,
    // Railway's public proxy URL needs TLS; the private network URL does not
    ssl: /proxy\.rlwy\.net|sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
