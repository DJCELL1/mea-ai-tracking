import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { env } from '../env.js';
import { HttpError } from '../http.js';
import { uid } from '../auth/session.js';
import { countSubscriptions, pushEnabled, removeSubscription, saveSubscription, sendToUser } from '../services/push.js';

const subscription = z.object({
  endpoint: z.string().url().max(2000).startsWith('https://'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export function pushRouter(db: Db) {
  const r = Router();

  r.get('/push', async (req, res) => {
    res.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? env.vapidPublicKey : null, devices: await countSubscriptions(db, uid(req)) });
  });

  r.post('/push/subscribe', async (req, res) => {
    if (!pushEnabled()) throw new HttpError(503, 'Push notifications are not set up on the server');
    await saveSubscription(db, uid(req), subscription.parse(req.body), req.get('user-agent'));
    res.status(201).json({ ok: true });
  });

  r.post('/push/unsubscribe', async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().max(2000) }).parse(req.body);
    await removeSubscription(db, uid(req), endpoint);
    res.json({ ok: true });
  });

  r.post('/push/test', async (req, res) => {
    const sent = await sendToUser(db, uid(req), { title: 'Mea notifications are on', body: "You'll get eating window, protein and target reminders here.", url: '/settings', tag: 'test' });
    res.json({ sent });
  });

  return r;
}
