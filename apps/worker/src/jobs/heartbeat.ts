import type { PgBoss } from "pg-boss";

export const HEARTBEAT_QUEUE = "heartbeat";

/** Placeholder job that proves the queue works. Real jobs (rollups, triage, alerts) go beside it. */
export async function registerHeartbeat(boss: PgBoss): Promise<void> {
  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.schedule(HEARTBEAT_QUEUE, "*/5 * * * *");
  await boss.work(HEARTBEAT_QUEUE, async () => {
    console.log(JSON.stringify({ msg: "worker heartbeat", at: new Date().toISOString() }));
  });
}
