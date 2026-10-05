import { Router } from 'express';
import { isValidTimeZone } from '@mea/shared';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { uid } from '../auth/session.js';
import { addDays, localDate } from '@mea/shared';
import { badRequest } from '../http.js';
import { refreshOutsideWindow } from '../services/fasting.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { fillSuggestions } from '../services/fill.js';
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
    const patch = settingsBody.parse(req.body);
    const current = await getSettings(db, uid(req));
    const start = patch.windowStart ?? current.windowStart;
    const end = patch.windowEnd ?? current.windowEnd;
    if (start >= end) throw badRequest('The eating window must close after it opens (same day)');
    const updated = await updateSettings(db, uid(req), patch);
    const windowChanged = start !== current.windowStart || end !== current.windowEnd || updated.timezone !== current.timezone;
    if (windowChanged) {
      // Re-flag recent entries against the new default window
      const today = localDate(new Date(), updated.timezone);
      await refreshOutsideWindow(db, uid(req), addDays(today, -90), addDays(today, 1));
    }
    res.json(updated);
  });

  r.get('/suggestions/protein', async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(10).default(5) }).parse(req.query);
    res.json(await proteinSuggestions(db, uid(req), limit));
  });

  /** "What can I eat?": portions that cover today's protein gap within the kcal left. */
  r.get('/suggestions/fill', async (req, res) => {
    res.json(await fillSuggestions(db, uid(req)));
  });

  return r;
}
