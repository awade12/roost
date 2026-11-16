import type { Clickhouse } from "@roost/clickhouse";
import type { email } from "@roost/core";
import type { Db } from "@roost/db";
import type { PgBoss } from "pg-boss";
import { registerAlerts } from "./alerts.ts";
import { registerHeartbeat } from "./heartbeat.ts";

export type JobDeps = { db: Db; ch: Clickhouse; secret: string; mailer: email.Mailer | null; dashboardUrl: string | null };

export async function registerJobs(boss: PgBoss, deps: JobDeps): Promise<void> {
  await registerHeartbeat(boss);
  await registerAlerts(boss, deps);
}
