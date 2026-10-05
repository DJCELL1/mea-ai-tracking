import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb, createPool } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { makeAfcdFixture } from './fixtures/make-afcd.js';
import { TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('first-run setup', () => {
  const pool = createPool(TEST_DB);
  const db = createDb(pool);
  const app = createApp({ db, session: { secret: 'test-secret', secureCookies: false } });
  const H = { 'X-Requested-With': 'mea' };
  const account = { code: 'my-setup-code', email: 'Me@Example.com', password: 'a long password' };

  beforeAll(async () => {
    await db.execute(sql`DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`);
    await runMigrations(db);
  });
  afterAll(async () => {
    delete process.env.SETUP_TOKEN;
    await pool.end();
  });

  it('needs SETUP_TOKEN to be configured', async () => {
    delete process.env.SETUP_TOKEN;
    expect((await request(app).get('/api/setup/status').expect(200)).body).toEqual({ needsAccount: true, setupCodeConfigured: false });
    await request(app).post('/api/setup/account').set(H).send(account).expect(503);
  });

  it('rejects a wrong code and weak passwords', async () => {
    process.env.SETUP_TOKEN = 'my-setup-code';
    await request(app).post('/api/setup/account').set(H).send({ ...account, code: 'nope' }).expect(401);
    await request(app).post('/api/setup/account').set(H).send({ ...account, password: 'short' }).expect(400);
  });

  const agent = request.agent(app);
  it('creates the account once, logs in, and then closes', async () => {
    await agent.post('/api/setup/account').set(H).send(account).expect(201);
    expect((await agent.get('/api/auth/me').expect(200)).body.email).toBe('me@example.com');
    await request(app).post('/api/setup/account').set(H).send({ ...account, email: 'other@example.com' }).expect(409);
    expect((await request(app).get('/api/setup/status').expect(200)).body).toMatchObject({ needsAccount: false, afcdFoods: 0 });
    // The new account can log in normally
    await request(app).post('/api/auth/login').set(H).send({ email: account.email, password: account.password }).expect(200);
  });

  it('only lets a logged-in user upload foods', async () => {
    await request(app).post('/api/foods/import').set(H).attach('nutrients', Buffer.from('x'), 'a.xlsx').expect(401);
  });

  it('imports an uploaded AFCD file, and re-uploading updates instead of duplicating', async () => {
    const file = await readFile(await makeAfcdFixture());
    const first = await agent.post('/api/foods/import').set(H).attach('nutrients', file, 'AFCD Release 3 - Nutrient profiles.xlsx').expect(200);
    expect(first.body).toMatchObject({ rowsRead: 5, inserted: 3, updated: 0, skippedCount: 2, stats: { afcdFoods: 3 } });
    const again = await agent.post('/api/foods/import').set(H).attach('nutrients', file, 'AFCD Release 3 - Nutrient profiles.xlsx').expect(200);
    expect(again.body).toMatchObject({ inserted: 0, updated: 3 });
    const stats = (await agent.get('/api/foods/stats').expect(200)).body;
    expect(stats.bySource).toContainEqual({ code: 'afcd', name: 'Australian Food Composition Database (FSANZ)', version: 'Release 3', count: 3 });
    expect(stats.lastImport).toMatchObject({ fileName: 'AFCD Release 3 - Nutrient profiles.xlsx', updated: 3 });
    // Searchable straight away
    const found = (await agent.get('/api/foods/search?q=chicken').expect(200)).body;
    expect(found.results[0].name).toBe('Chicken, breast, lean, grilled');
  });

  it('explains a wrong file instead of failing obscurely', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['Hello']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await agent.post('/api/foods/import').set(H).attach('nutrients', buf, 'Recipes.xlsx').expect(400);
    expect(res.body.error).toMatch(/Nutrient profiles/);
    await agent.post('/api/foods/import').set(H).attach('nutrients', Buffer.from('x'), 'notes.txt').expect(400);
  });
});
