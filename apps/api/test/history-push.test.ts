import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const sent: { endpoint: string; payload: string }[] = [];
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload });
    },
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
  },
}));
process.env.VAPID_PUBLIC_KEY = 'test-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';

import { addDays, localDate, zonedToUtc } from '@mea/shared';
import type { HistoryResponse } from '../src/services/history.js';
import { runNotificationTick } from '../src/services/push.js';
import { foodId, setupApp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('history, export and push', () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  const TZ = 'Australia/Sydney';
  const today = localDate(new Date(), TZ);
  const y = addDays(today, -1);
  beforeAll(async () => {
    ctx = await setupApp();
    const chicken = await foodId(ctx.db, 'Chicken, breast, lean, grilled');
    for (const [date, time, grams] of [
      [addDays(today, -2), '19:00', 200],
      [y, '12:30', 150],
      [y, '19:00', 100],
    ] as const) {
      await ctx.agent.post('/api/log').set(ctx.H).send({ date, meal: 'dinner', foodId: chicken, grams, eatenAt: zonedToUtc(date, time, TZ).toISOString() }).expect(201);
    }
    await ctx.agent.post('/api/log/quick').set(ctx.H).send({ date: y, meal: 'snack', name: '=HYPERLINK("x")', energyKcal: 100 }).expect(201);
  });
  afterAll(() => ctx.pool.end());

  it('returns daily totals for every day in the range, with fasting hours', async () => {
    const h = (await ctx.agent.get(`/api/history?from=${addDays(today, -3)}&to=${today}`).expect(200)).body as HistoryResponse;
    expect(h.days.map((d) => d.date)).toEqual([addDays(today, -3), addDays(today, -2), y, today]);
    expect(h.days[0]).toMatchObject({ entries: 0, energyKcal: null });
    expect(h.days[2]).toMatchObject({ entries: 3, proteinG: 77.5, energyKcal: Math.round(162 * 2.5 + 100) });
    expect(h.days[2].hoursFasted).toBeGreaterThan(16);
    expect(h.targets).toMatchObject({ kcal: 2000, proteinG: 150 });
  });

  it('validates the range', async () => {
    await ctx.agent.get(`/api/history?from=${today}&to=${y}`).expect(400);
    await ctx.agent.get('/api/history?from=2020-01-01&to=2026-01-01').expect(400);
  });

  it('exports entries and daily totals as CSV, safe for spreadsheets', async () => {
    const res = await ctx.agent.get(`/api/export/entries.csv?from=${y}&to=${y}`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain(`mea-entries-${y}-to-${y}.csv`);
    const lines = res.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('date,time,meal,food,grams,serving,servings,energy_kj,energy_kcal,protein_g,carbs_g,fat_g,sugars_g,fibre_g,sodium_mg,type,outside_window');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(new RegExp(`^${y},12:30,dinner,"Chicken, breast, lean, grilled",150,`));
    // Formula injection neutralised
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);

    const daily = await ctx.agent.get(`/api/export/daily.csv?from=${addDays(today, -2)}&to=${y}`).expect(200);
    expect(daily.text.split('\r\n')[0]).toMatch(/^﻿date,entries,energy_kj,energy_kcal,kcal_target/);
  });

  it('stores subscriptions, sends a test, and drops dead ones', async () => {
    const info = (await ctx.agent.get('/api/push').expect(200)).body;
    expect(info).toMatchObject({ enabled: true, publicKey: 'test-public-key', devices: 0 });
    await ctx.agent.post('/api/push/subscribe').set(ctx.H).send({ endpoint: 'https://push.example/ok', keys: { p256dh: 'p', auth: 'a' } }).expect(201);
    await ctx.agent.post('/api/push/subscribe').set(ctx.H).send({ endpoint: 'https://push.example/gone', keys: { p256dh: 'p', auth: 'a' } }).expect(201);
    await ctx.agent.post('/api/push/subscribe').set(ctx.H).send({ endpoint: 'http://insecure', keys: { p256dh: 'p', auth: 'a' } }).expect(400);
    expect((await ctx.agent.post('/api/push/test').set(ctx.H).send({}).expect(200)).body.sent).toBe(1);
    expect((await ctx.agent.get('/api/push').expect(200)).body.devices).toBe(1);
  });

  it('sends each scheduled notification once per day', async () => {
    sent.length = 0;
    const openAt = zonedToUtc(today, '12:01', TZ);
    expect(await runNotificationTick(ctx.db, openAt)).toBe(1);
    expect(await runNotificationTick(ctx.db, new Date(openAt.getTime() + 60_000))).toBe(0);
    expect(JSON.parse(sent[0].payload)).toMatchObject({ title: 'Eating window open', tag: 'window_open' });
  });
});
