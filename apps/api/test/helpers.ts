import { sql } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb, createPool } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { settings, users } from '../src/db/schema.js';
import { hashPassword } from '../src/auth/password.js';
import { afcd } from '../src/import/sources/afcd.js';
import { importFoods } from '../src/import/upsert.js';
import { makeAfcdFixture } from './fixtures/make-afcd.js';

export const TEST_DB = process.env.TEST_DATABASE_URL;

/** Fresh schema + AFCD fixture foods + one user; returns a logged-in supertest agent. */
export async function setupApp() {
  const pool = createPool(TEST_DB);
  const db = createDb(pool);
  await db.execute(sql`DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`);
  await runMigrations(db);
  await importFoods(db, afcd, await makeAfcdFixture());
  const [user] = await db.insert(users).values({ email: 'me@example.com', passwordHash: await hashPassword('correct horse battery') }).returning();
  await db.insert(settings).values({ userId: user.id, timezone: 'Australia/Sydney' });

  const app = createApp({ db, session: { secret: 'test-secret', secureCookies: false } });
  const agent = request.agent(app);
  const H = { 'X-Requested-With': 'mea' };
  await agent.post('/api/auth/login').set(H).send({ email: 'me@example.com', password: 'correct horse battery' }).expect(200);
  return { pool, db, app, agent, H };
}

export async function foodId(db: ReturnType<typeof createDb>, name: string): Promise<number> {
  const res = await db.execute<{ id: number }>(sql`SELECT id FROM foods WHERE name = ${name}`);
  return res.rows[0].id;
}
