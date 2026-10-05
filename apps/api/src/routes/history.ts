import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { uid } from '../auth/session.js';
import { dailyCsv, dailyHistory, entriesCsv } from '../services/history.js';
import { dateStr } from './validators.js';

const range = z.object({ from: dateStr, to: dateStr });

export function historyRouter(db: Db) {
  const r = Router();

  r.get('/history', async (req, res) => {
    const { from, to } = range.parse(req.query);
    res.json(await dailyHistory(db, uid(req), from, to));
  });

  r.get('/export/:kind.csv', async (req, res) => {
    const { kind } = z.object({ kind: z.enum(['entries', 'daily']) }).parse(req.params);
    const { from, to } = range.parse(req.query);
    const csv = kind === 'entries' ? await entriesCsv(db, uid(req), from, to) : await dailyCsv(db, uid(req), from, to);
    res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mea-${kind}-${from}-to-${to}.csv"`,
        'Cache-Control': 'no-store',
      })
      // BOM so Excel opens UTF-8 correctly
      .send('﻿' + csv);
  });

  return r;
}
