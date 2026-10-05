import { and, eq, gt, lt } from 'drizzle-orm';
import { createHmac, randomBytes } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { HttpError } from '../http.js';

export const SESSION_COOKIE = 'mea_session';
const SESSION_DAYS = 90;
const REFRESH_WHEN_DAYS_LEFT = 30;
const DAY_MS = 86_400_000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: number; email: string };
    }
  }
}

export interface SessionConfig {
  secret: string;
  secureCookies: boolean;
}

/** The DB stores an HMAC of the token, so a leaked sessions table can't be used to log in. */
function sessionId(token: string, secret: string) {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function setCookie(res: Response, token: string, expires: Date, cfg: SessionConfig) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: cfg.secureCookies, sameSite: 'lax', expires, path: '/' });
}

export async function createSession(db: Db, res: Response, userId: number, cfg: SessionConfig) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.insert(sessions).values({ id: sessionId(token, cfg.secret), userId, expiresAt });
  // Opportunistic cleanup of expired sessions
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  setCookie(res, token, expiresAt, cfg);
}

export async function destroySession(db: Db, req: Request, res: Response, cfg: SessionConfig) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.delete(sessions).where(eq(sessions.id, sessionId(token, cfg.secret)));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Attaches req.user when the cookie is valid, sliding the expiry forward when it gets close. */
export function loadSession(db: Db, cfg: SessionConfig): RequestHandler {
  return async (req, res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    const id = sessionId(token, cfg.secret);
    const [row] = await db
      .select({ userId: sessions.userId, expiresAt: sessions.expiresAt, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
    if (!row) return next();
    req.user = { id: row.userId, email: row.email };
    if (row.expiresAt.getTime() - Date.now() < REFRESH_WHEN_DAYS_LEFT * DAY_MS) {
      const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
      setCookie(res, token, expiresAt, cfg);
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please log in'));
  next();
}

/** The logged-in user's id (only call behind requireAuth). */
export function uid(req: Request): number {
  return req.user!.id;
}

/**
 * Mutating requests must carry `X-Requested-With`. Browsers won't send custom headers
 * cross-site without a CORS preflight (which this API never approves), so this blocks CSRF.
 */
export function requireCustomHeader(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!req.get('x-requested-with')) return next(new HttpError(403, 'Missing X-Requested-With header'));
  next();
}

/** Simple in-memory limiter for failed logins (single instance, single user). */
export function createLoginLimiter(maxFailures = 10, windowMs = 15 * 60_000) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string) {
      const f = failures.get(key);
      if (f && f.resetAt > Date.now() && f.count >= maxFailures) {
        throw new HttpError(429, `Too many failed logins. Try again in ${Math.ceil((f.resetAt - Date.now()) / 60_000)} min.`);
      }
    },
    fail(key: string) {
      const f = failures.get(key);
      if (!f || f.resetAt <= Date.now()) failures.set(key, { count: 1, resetAt: Date.now() + windowMs });
      else f.count++;
    },
    succeed(key: string) {
      failures.delete(key);
    },
  };
}
