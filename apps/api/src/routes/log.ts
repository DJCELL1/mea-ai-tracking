import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { uid } from '../auth/session.js';
import { copyDay, dayLog, deleteEntry, logFood, quickAdd, updateEntry } from '../services/log.js';
import { getSettings } from '../services/settings.js';
import { copyDayBody, dateStr, entryPatchBody, idParam, logFoodBody, quickAddBody } from './validators.js';

export function logRouter(db: Db) {
  const r = Router();
  const tz = async (userId: number) => (await getSettings(db, userId)).timezone;

  r.get('/log', async (req, res) => {
    const { date } = z.object({ date: dateStr }).parse(req.query);
    res.json(await dayLog(db, uid(req), date));
  });

  r.post('/log', async (req, res) => {
    const body = logFoodBody.parse(req.body);
    res.status(201).json(await logFood(db, uid(req), await tz(uid(req)), body));
  });

  r.post('/log/quick', async (req, res) => {
    const body = quickAddBody.parse(req.body);
    res.status(201).json(await quickAdd(db, uid(req), await tz(uid(req)), body));
  });

  r.post('/log/copy', async (req, res) => {
    const body = copyDayBody.parse(req.body);
    const copied = await copyDay(db, uid(req), await tz(uid(req)), body.fromDate, body.toDate, body.meals);
    res.json({ copied });
  });

  r.patch('/log/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await updateEntry(db, uid(req), id, entryPatchBody.parse(req.body)));
  });

  r.delete('/log/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await deleteEntry(db, uid(req), id);
    res.status(204).end();
  });

  return r;
}
