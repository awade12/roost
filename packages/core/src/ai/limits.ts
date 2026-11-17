import type { Clickhouse } from "@roost/clickhouse";
import type { Db } from "@roost/db";
import { getLimits } from "./templates/index.ts";
import { limitCounters } from "./usage.ts";

export type LimitRefusal = { status: "rate_limited" | "over_budget" | "over_cap"; message: string };

/**
 * Per-minute, per-player daily and per-game monthly limits, shared by every kind of AI call
 * (templates, direct calls, decisions). Returns the refusal, if any.
 */
export async function checkLimits(deps: { db: Db; ch: Clickhouse }, gameId: string, playerId: string): Promise<LimitRefusal | null> {
  const [limits, counters] = await Promise.all([getLimits(deps.db, gameId), limitCounters(deps.ch, gameId, playerId)]);
  if (counters.playerCallsLastMinute >= limits.playerPerMinute) return { status: "rate_limited", message: "Too many AI requests from this player. Try again in a minute." };
  if (counters.playerTokensToday >= limits.playerDailyTokens) return { status: "over_budget", message: "This player has used today's AI budget." };
  if (counters.spendUsd * 100 >= limits.monthlyCapCents) return { status: "over_cap", message: "This game has reached its monthly AI spend cap." };
  return null;
}
