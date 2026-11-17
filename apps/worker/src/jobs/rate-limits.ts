import { rateLimits } from "@roost/core";
import type { Db } from "@roost/db";
import type { PgBoss } from "pg-boss";

export const RATE_LIMIT_PRUNE_QUEUE = "rate-limit-prune";

/** The API's shared rate-limit counters only matter for their window; drop finished ones hourly. */
export async function registerRateLimitPrune(boss: PgBoss, db: Db): Promise<void> {
  await boss.createQueue(RATE_LIMIT_PRUNE_QUEUE);
  await boss.schedule(RATE_LIMIT_PRUNE_QUEUE, "7 * * * *");
  await boss.work(RATE_LIMIT_PRUNE_QUEUE, async () => {
    await rateLimits.pruneExpired(db);
  });
}
