import { and, eq, sql } from 'drizzle-orm';
import { localDate, windowFor } from '@mea/shared';
import webpush from 'web-push';
import type { Db } from '../db/client.js';
import { notificationsSent, pushSubscriptions } from '../db/schema.js';
import { env } from '../env.js';
import { overridesBetween } from './fasting.js';
import { dayLog } from './log.js';
import { dueNotifications } from './notify-rules.js';
import { getSettings } from './settings.js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured = false;
let failed = false;

/** Accept a bare email for VAPID_SUBJECT by adding the mailto: the push services require. */
export function normaliseSubject(subject: string): string {
  const s = subject.trim();
  return /^[^@\s:]+@[^@\s]+$/.test(s) ? `mailto:${s}` : s;
}

/** True when push is set up. A bad push setting turns push off (with a log line) instead of crashing the app. */
export function pushEnabled(): boolean {
  if (configured) return true;
  if (failed) return false;
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = env;
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  try {
    webpush.setVapidDetails(normaliseSubject(vapidSubject), vapidPublicKey, vapidPrivateKey);
    configured = true;
    return true;
  } catch (err) {
    failed = true;
    console.error(`Push notifications off: ${(err as Error).message}. Check VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (e.g. mailto:you@example.com).`);
    return false;
  }
}

export async function saveSubscription(db: Db, userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) } });
}

export async function removeSubscription(db: Db, userId: number, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function countSubscriptions(db: Db, userId: number) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return r.n;
}

/** Send to every device the user has subscribed; drops subscriptions the push service says are gone. */
export async function sendToUser(db: Db, userId: number, payload: PushPayload): Promise<number> {
  if (!pushEnabled()) return 0;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        else console.warn(`Push to subscription ${s.id} failed (${status ?? 'network'})`);
      }
    }),
  );
  return sent;
}

/** Claim a (kind, day) slot; true only for the first caller, so each notification goes out once. */
async function claim(db: Db, userId: number, kind: string, date: string): Promise<boolean> {
  const rows = await db.insert(notificationsSent).values({ userId, kind, date }).onConflictDoNothing().returning({ kind: notificationsSent.kind });
  return rows.length > 0;
}

/** One scheduler tick: work out and send due notifications for every user with a device subscribed. */
export async function runNotificationTick(db: Db, now = new Date()) {
  if (!pushEnabled()) return 0;
  const users = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  let total = 0;
  for (const { userId } of users) {
    const s = await getSettings(db, userId);
    const today = localDate(now, s.timezone);
    const [override] = await overridesBetween(db, userId, today, today);
    const window = windowFor(today, s, override);
    const day = await dayLog(db, userId, today);
    for (const n of dueNotifications(now, s, today, window, day.totals)) {
      if (await claim(db, userId, n.kind, today)) total += await sendToUser(db, userId, { title: n.title, body: n.body, url: n.url, tag: n.kind });
    }
  }
  return total;
}

/** Run the tick at the start of every minute. Returns a stop function. */
export function startNotificationScheduler(db: Db) {
  if (!pushEnabled()) {
    if (!failed) console.log('Push notifications off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable them.');
    return () => {};
  }
  let timer: NodeJS.Timeout;
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        await runNotificationTick(db);
      } catch (err) {
        console.error('Notification tick failed', err);
      }
      schedule();
    }, 60_000 - (Date.now() % 60_000) + 500);
  };
  schedule();
  console.log('Push notification scheduler running.');
  return () => clearTimeout(timer);
}
