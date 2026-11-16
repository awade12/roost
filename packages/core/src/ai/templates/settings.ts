import { aiSettings, type Db } from "@roost/db";
import { eq } from "drizzle-orm";

export type AiLimits = { monthlyCapCents: number; playerDailyTokens: number; playerPerMinute: number };

/** Used until an owner saves limits for the game. Deliberately conservative. */
export const DEFAULT_LIMITS: AiLimits = { monthlyCapCents: 5000, playerDailyTokens: 20000, playerPerMinute: 10 };

export async function getLimits(db: Db, gameId: string): Promise<AiLimits> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.gameId, gameId)).limit(1);
  return row
    ? { monthlyCapCents: row.monthlyCapCents, playerDailyTokens: row.playerDailyTokens, playerPerMinute: row.playerPerMinute }
    : DEFAULT_LIMITS;
}

export async function saveLimits(db: Db, gameId: string, limits: AiLimits): Promise<AiLimits> {
  await db
    .insert(aiSettings)
    .values({ gameId, ...limits })
    .onConflictDoUpdate({ target: aiSettings.gameId, set: { ...limits, updatedAt: new Date() } });
  return limits;
}
