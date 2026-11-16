import { alerts, issues } from "@roost/core";
import type { PgBoss } from "pg-boss";
import type { JobDeps } from "./index.ts";

export const ALERTS_QUEUE = "alerts";
export const AUTO_RESOLVE_QUEUE = "issues-auto-resolve";

/**
 * Alert rules are checked every minute. pg-boss runs one scheduled job at a time per
 * queue, so two workers can't send the same alert twice in one tick.
 */
export async function registerAlerts(boss: PgBoss, deps: JobDeps): Promise<void> {
  await boss.createQueue(ALERTS_QUEUE, { policy: "singleton" });
  await boss.schedule(ALERTS_QUEUE, "* * * * *");
  await boss.work(ALERTS_QUEUE, async () => {
    const { fired } = await alerts.runAlerts({ ...deps, fetch });
    if (fired) console.log(JSON.stringify({ msg: "alerts sent", fired }));
  });

  await boss.createQueue(AUTO_RESOLVE_QUEUE, { policy: "singleton" });
  await boss.schedule(AUTO_RESOLVE_QUEUE, "17 * * * *");
  await boss.work(AUTO_RESOLVE_QUEUE, async () => {
    const resolved = await issues.autoResolve(deps.db);
    if (resolved) console.log(JSON.stringify({ msg: "issues auto-resolved", resolved }));
  });
}
