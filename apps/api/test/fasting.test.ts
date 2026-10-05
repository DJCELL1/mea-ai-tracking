import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, localDate, type DayLogDto, type FastingHistory } from '@mea/shared';
import { foodId, setupApp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('fasting window', () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let apple: number;
  const TZ = 'Australia/Sydney';
  const today = localDate(new Date(), TZ);
  const yesterday = addDays(today, -1);
  // Local wall-clock time on a date → ISO instant (Sydney is +10 or +11; use the app helper)
  let at: (date: string, time: string) => string;

  beforeAll(async () => {
    ctx = await setupApp();
    apple = await foodId(ctx.db, 'Apple, red delicious, with skin, raw');
    const { zonedToUtc } = await import('@mea/shared');
    at = (d, t) => zonedToUtc(d, t, TZ).toISOString();
  });
  afterAll(() => ctx.pool.end());

  const log = (date: string, time: string) =>
    ctx.agent.post('/api/log').set(ctx.H).send({ date, meal: 'snack', foodId: apple, grams: 100, eatenAt: at(date, time) }).expect(201);

  it('flags food eaten outside the window but still logs it', async () => {
    const inside = await log(yesterday, '13:00');
    const outside = await log(yesterday, '21:30');
    expect(inside.body.outsideWindow).toBe(false);
    expect(outside.body.outsideWindow).toBe(true);
  });

  it('re-flags entries when a day gets its own window', async () => {
    const res = await ctx.agent.put(`/api/fasting/overrides/${yesterday}`).set(ctx.H).send({ startTime: '11:00', endTime: '22:00' }).expect(200);
    expect(res.body.overrides).toContainEqual({ date: yesterday, startTime: '11:00', endTime: '22:00', isFastDay: false });
    let day = (await ctx.agent.get(`/api/log?date=${yesterday}`).expect(200)).body as DayLogDto;
    expect(day.entries.every((e) => !e.outsideWindow)).toBe(true);

    await ctx.agent.delete(`/api/fasting/overrides/${yesterday}`).set(ctx.H).expect(200);
    day = (await ctx.agent.get(`/api/log?date=${yesterday}`).expect(200)).body;
    expect(day.entries.map((e) => e.outsideWindow)).toEqual([false, true]);
  });

  it('re-flags when the default window changes, and validates windows', async () => {
    await ctx.agent.put('/api/settings').set(ctx.H).send({ windowStart: '20:00', windowEnd: '12:00' }).expect(400);
    await ctx.agent.put(`/api/fasting/overrides/${today}`).set(ctx.H).send({ startTime: '18:00', endTime: '09:00' }).expect(400);
    await ctx.agent.put('/api/settings').set(ctx.H).send({ windowStart: '10:00', windowEnd: '22:00' }).expect(200);
    const day = (await ctx.agent.get(`/api/log?date=${yesterday}`).expect(200)).body as DayLogDto;
    expect(day.entries.map((e) => e.outsideWindow)).toEqual([false, false]);
    await ctx.agent.put('/api/settings').set(ctx.H).send({ windowStart: '12:00', windowEnd: '20:00' }).expect(200);
  });

  it('returns windows for the coming week, with fast days', async () => {
    const tomorrow = addDays(today, 1);
    const res = await ctx.agent.put(`/api/fasting/overrides/${tomorrow}`).set(ctx.H).send({ isFastDay: true }).expect(200);
    expect(res.body.windows).toHaveLength(8);
    expect(res.body.windows[0]).toMatchObject({ date: today, startTime: '12:00', endTime: '20:00', isFastDay: false });
    expect(res.body.windows[1]).toMatchObject({ date: tomorrow, isFastDay: true, isOverride: true });
    expect(res.body.lastFoodAt).toBe(at(yesterday, '21:30'));
  });

  it('reports hours fasted and the streak', async () => {
    const twoDaysAgo = addDays(today, -2);
    await log(twoDaysAgo, '19:00'); // fast to yesterday 13:00: 18 h, or 17/19 h across a daylight-saving change
    const expected = Math.round((Date.parse(at(yesterday, '13:00')) - Date.parse(at(twoDaysAgo, '19:00'))) / 360_000) / 10;
    const h = (await ctx.agent.get('/api/fasting/history?days=3').expect(200)).body as FastingHistory;
    expect(h.goalHours).toBe(16);
    expect(h.days.map((d) => d.date)).toEqual([twoDaysAgo, yesterday, today]);
    expect(h.days[1]).toMatchObject({ hoursFasted: expected, metGoal: true });
    expect(h.days[2].ongoing).toBe(true);
  });
});
