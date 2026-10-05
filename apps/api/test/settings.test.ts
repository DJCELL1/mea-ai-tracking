import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SettingsDto } from '@mea/shared';
import type { ProteinSuggestion } from '../src/services/suggestions.js';
import { foodId, setupApp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('settings and protein suggestions', () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  beforeAll(async () => {
    ctx = await setupApp();
  });
  afterAll(() => ctx.pool.end());

  it('updates targets and alert settings', async () => {
    const res = await ctx.agent
      .put('/api/settings')
      .set(ctx.H)
      .send({ kcalTarget: 2200, proteinGTarget: 160, carbsGTarget: 220, fatGTarget: 70, closeAlertPct: 85, proteinNudgeTime: '14:30', proteinNudgePct: 60 })
      .expect(200);
    expect(res.body as SettingsDto).toMatchObject({ kcalTarget: 2200, proteinNudgeTime: '14:30', closeAlertPct: 85, windowStart: '12:00' });
    expect((await ctx.agent.get('/api/auth/me').expect(200)).body.settings.kcalTarget).toBe(2200);
  });

  it('rejects bad values and unknown fields', async () => {
    const bad = await ctx.agent.put('/api/settings').set(ctx.H).send({ kcalTarget: 50, proteinNudgeTime: '25:00', timezone: 'Mars/Base' }).expect(400);
    expect(bad.body.issues.join(' ')).toMatch(/kcalTarget.*proteinNudgeTime.*timezone|timezone/s);
    await ctx.agent.put('/api/settings').set(ctx.H).send({ isAdmin: true }).expect(400);
  });

  it('suggests high-protein foods from history first, using my usual amount', async () => {
    const chicken = await foodId(ctx.db, 'Chicken, breast, lean, grilled');
    const apple = await foodId(ctx.db, 'Apple, red delicious, with skin, raw');
    for (const grams of [150, 180]) await ctx.agent.post('/api/log').set(ctx.H).send({ date: '2026-10-05', meal: 'lunch', foodId: chicken, grams }).expect(201);
    await ctx.agent.post('/api/log').set(ctx.H).send({ date: '2026-10-05', meal: 'snack', foodId: apple, grams: 150 }).expect(201);

    const res = (await ctx.agent.get('/api/suggestions/protein').expect(200)).body as ProteinSuggestion[];
    expect(res[0]).toMatchObject({ fromHistory: true, grams: 180, proteinG: 55.8, food: { name: 'Chicken, breast, lean, grilled' } });
    // Apples aren't high protein
    expect(res.find((s) => s.food.id === apple)).toBeUndefined();
  });
});
