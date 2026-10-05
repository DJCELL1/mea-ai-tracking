import { Router } from 'express';
import { isValidTimeZone } from '@mea/shared';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { uid } from '../auth/session.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { proteinSuggestions } from '../services/suggestions.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time HH:MM');

export const settingsBody = z
  .object({
    timezone: z.string().refine(isValidTimeZone, 'unknown timezone'),
    kcalTarget: z.number().int().min(500).max(10_000),
    proteinGTarget: z.number().int().min(0).max(1_000),
    carbsGTarget: z.number().int().min(0).max(2_000),
    fatGTarget: z.number().int().min(0).max(1_000),
    closeAlertPct: z.number().int().min(50).max(100),
    proteinNudgeTime: hhmm,
    proteinNudgePct: z.number().int().min(0).max(100),
    windowStart: hhmm,
    windowEnd: hhmm,
    windowCloseWarningMin: z.number().int().min(0).max(240),
    fastingGoalHours: z.number().min(0).max(72),
    notifyWindowOpen: z.boolean(),
    notifyWindowClosing: z.boolean(),
    notifyWindowClosed: z.boolean(),
    notifyProtein: z.boolean(),
    notifyTargets: z.boolean(),
  })
  .partial()
  .strict();

export function settingsRouter(db: Db) {
  const r = Router();

  r.get('/settings', async (req, res) => {
    res.json(await getSettings(db, uid(req)));
  });

  r.put('/settings', async (req, res) => {
    res.json(await updateSettings(db, uid(req), settingsBody.parse(req.body)));
  });

  r.get('/suggestions/protein', async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(10).default(5) }).parse(req.query);
    res.json(await proteinSuggestions(db, uid(req), limit));
  });

  return r;
}
