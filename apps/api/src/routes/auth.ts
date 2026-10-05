import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { localDate } from '@mea/shared';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { HttpError } from '../http.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createLoginLimiter, createSession, destroySession, requireAuth, uid, type SessionConfig } from '../auth/session.js';
import { getSettings } from '../services/settings.js';

// Verified against when the email is unknown, so response time doesn't reveal which emails exist
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

export function authRouter(db: Db, cfg: SessionConfig) {
  const r = Router();
  const limiter = createLoginLimiter();

  r.post('/login', async (req, res) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const key = `${req.ip}|${body.email}`;
    limiter.check(key);
    const [user] = await db.select().from(users).where(eq(users.email, body.email));
    const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), body.password).catch(() => false);
    if (!user || !ok) {
      limiter.fail(key);
      throw new HttpError(401, 'Wrong email or password');
    }
    limiter.succeed(key);
    await createSession(db, res, user.id, cfg);
    res.json({ ok: true });
  });

  r.post('/logout', async (req, res) => {
    await destroySession(db, req, res, cfg);
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, async (req, res) => {
    const settings = await getSettings(db, uid(req));
    res.json({ email: req.user!.email, today: localDate(new Date(), settings.timezone), settings });
  });

  return r;
}
