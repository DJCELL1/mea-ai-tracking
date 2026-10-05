import { eq } from 'drizzle-orm';
import type { SettingsDto } from '@mea/shared';
import type { Db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { env } from '../env.js';

const hhmm = (t: string) => t.slice(0, 5);

export async function getSettings(db: Db, userId: number): Promise<SettingsDto> {
  let [row] = await db.select().from(settings).where(eq(settings.userId, userId));
  if (!row) {
    [row] = await db.insert(settings).values({ userId, timezone: env.tzDefault }).onConflictDoNothing().returning();
    if (!row) [row] = await db.select().from(settings).where(eq(settings.userId, userId));
  }
  const { userId: _u, updatedAt: _t, ...rest } = row;
  return {
    ...rest,
    proteinNudgeTime: hhmm(rest.proteinNudgeTime),
    windowStart: hhmm(rest.windowStart),
    windowEnd: hhmm(rest.windowEnd),
  };
}

export type SettingsPatch = Partial<SettingsDto>;

export async function updateSettings(db: Db, userId: number, patch: SettingsPatch): Promise<SettingsDto> {
  await getSettings(db, userId); // make sure the row exists
  if (Object.keys(patch).length) await db.update(settings).set({ ...patch, updatedAt: new Date() }).where(eq(settings.userId, userId));
  return getSettings(db, userId);
}
