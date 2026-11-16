import type { PgBoss } from "pg-boss";
import { registerHeartbeat } from "./heartbeat.ts";

export async function registerJobs(boss: PgBoss): Promise<void> {
  await registerHeartbeat(boss);
}
