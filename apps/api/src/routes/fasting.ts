import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { badRequest } from '../http.js';
import { uid } from '../auth/session.js';
import { clearOverride, fastingOverview, history, setOverride } from '../services/fasting.js';
import { dateStr } from './validators.js';

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time HH:MM');

const overrideBody = z.union([
  z.object({ isFastDay: z.literal(true) }).strict(),
  z.object({ startTime: hhmm, endTime: hhmm }).strict(),
]);

export function fastingRouter(db: Db) {
  const r = Router();

  r.get('/fasting', async (req, res) => {
    res.json(await fastingOverview(db, uid(req)));
  });

  r.get('/fasting/history', async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    res.json(await history(db, uid(req), days));
  });

  r.put('/fasting/overrides/:date', async (req, res) => {
    const { date } = z.object({ date: dateStr }).parse(req.params);
    const body = overrideBody.parse(req.body);
    // Windows run within one calendar day
    if ('startTime' in body && body.startTime >= body.endTime) throw badRequest('The window must close after it opens (same day)');
    await setOverride(db, uid(req), date, body);
    res.json(await fastingOverview(db, uid(req)));
  });

  r.delete('/fasting/overrides/:date', async (req, res) => {
    const { date } = z.object({ date: dateStr }).parse(req.params);
    await clearOverride(db, uid(req), date);
    res.json(await fastingOverview(db, uid(req)));
  });

  return r;
}
