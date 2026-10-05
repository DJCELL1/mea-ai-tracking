import { Router, type RequestHandler } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import multer from 'multer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { foods, foodSources, importRuns, settings, users } from '../db/schema.js';
import { env } from '../env.js';
import { badRequest, HttpError } from '../http.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/password.js';
import { createLoginLimiter, createSession, requireAuth, type SessionConfig } from '../auth/session.js';
import { afcd } from '../import/sources/afcd.js';
import { importFoods } from '../import/upsert.js';

async function userCount(db: Db) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return r.n;
}

async function foodStats(db: Db) {
  const bySource = await db
    .select({ code: foodSources.code, name: foodSources.name, version: foodSources.version, count: sql<number>`count(${foods.id})::int` })
    .from(foodSources)
    .leftJoin(foods, eq(foods.sourceId, foodSources.id))
    .groupBy(foodSources.id)
    .orderBy(foodSources.code);
  const [last] = await db.select().from(importRuns).orderBy(desc(importRuns.startedAt)).limit(1);
  const afcdCount = bySource.find((s) => s.code === 'afcd')?.count ?? 0;
  return { afcdFoods: afcdCount, bySource, lastImport: last ? { at: last.finishedAt ?? last.startedAt, fileName: last.fileName, inserted: last.inserted, updated: last.updated, skipped: last.skipped } : null };
}

/** Compare the setup code without leaking how much of it matched. */
function codeMatches(given: string, expected: string) {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => cb(null, /\.xlsx$/i.test(file.originalname)),
});

/**
 * First-run setup, usable from a phone:
 * - create the one login (only while no account exists, and only with SETUP_TOKEN)
 * - upload the AFCD Excel file to load or refresh the food database (logged in)
 */
export function setupRouter(db: Db, cfg: SessionConfig) {
  const r = Router();
  const limiter = createLoginLimiter(10, 15 * 60_000);

  r.get('/setup/status', async (_req, res) => {
    const needsAccount = (await userCount(db)) === 0;
    res.json({ needsAccount, setupCodeConfigured: !!env.setupToken, ...(needsAccount ? {} : { afcdFoods: (await foodStats(db)).afcdFoods }) });
  });

  r.post('/setup/account', async (req, res) => {
    const body = z
      .object({
        code: z.string().min(1).max(200),
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
      })
      .parse(req.body);
    if (!env.setupToken) throw new HttpError(503, 'Add a SETUP_TOKEN variable on Railway first, then try again.');
    const key = `setup|${req.ip}`;
    limiter.check(key);
    if (!codeMatches(body.code, env.setupToken)) {
      limiter.fail(key);
      throw new HttpError(401, "That setup code doesn't match SETUP_TOKEN.");
    }
    const user = await db.transaction(async (tx) => {
      // Serialise concurrent attempts so only one account can ever be created this way
      await tx.execute(sql`LOCK TABLE ${users} IN EXCLUSIVE MODE`);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
      if (n > 0) throw new HttpError(409, 'Setup is already done. Log in instead.');
      const [u] = await tx.insert(users).values({ email: body.email, passwordHash: await hashPassword(body.password) }).returning();
      await tx.insert(settings).values({ userId: u.id, timezone: env.tzDefault });
      return u;
    });
    limiter.succeed(key);
    await createSession(db, res, user.id, cfg);
    res.status(201).json({ ok: true });
  });

  r.get('/foods/stats', requireAuth, async (_req, res) => {
    res.json(await foodStats(db));
  });

  const handleUpload: RequestHandler = (req, res, next) => {
    upload.fields([
      { name: 'nutrients', maxCount: 1 },
      { name: 'details', maxCount: 1 },
    ])(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'That file is too big (30 MB max).' : err.message));
      next(err);
    });
  };

  r.post('/foods/import', requireAuth, handleUpload, async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const nutrients = files?.nutrients?.[0];
    if (!nutrients) throw badRequest('Choose the AFCD "Nutrient profiles" Excel file (.xlsx).');
    const dir = await mkdtemp(path.join(tmpdir(), 'mea-import-'));
    try {
      // Keep the original name (it carries the release number); the importer finds "Food Details" beside it
      const safe = path.basename(nutrients.originalname).replace(/[^\w .()-]/g, '_') || 'AFCD Nutrient profiles.xlsx';
      const file = path.join(dir, /food details/i.test(safe) ? 'AFCD Nutrient profiles.xlsx' : safe);
      await writeFile(file, nutrients.buffer);
      const details = files?.details?.[0];
      if (details) await writeFile(path.join(dir, 'AFCD Food Details.xlsx'), details.buffer);
      let summary;
      try {
        summary = await importFoods(db, afcd, file);
      } catch (e) {
        throw badRequest(`Couldn't read that file: ${(e as Error).message.replace(/ Run with --inspect\.?/, '')} Make sure it's the AFCD "Nutrient profiles" file.`);
      }
      res.json({ ...summary, skipped: summary.skipped.slice(0, 20), skippedCount: summary.skipped.length, withDescriptions: !!details, stats: await foodStats(db) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  return r;
}
