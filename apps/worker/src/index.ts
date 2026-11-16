import { createClickhouse } from "@roost/clickhouse";
import { email } from "@roost/core";
import { createDb } from "@roost/db";
import { PgBoss } from "pg-boss";
import { loadEnv, type Env } from "./env.ts";
import { registerJobs } from "./jobs/index.ts";

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
const ch = createClickhouse(env);
const boss = new PgBoss(env.DATABASE_URL);
boss.on("error", (err) => console.error(JSON.stringify({ msg: "pg-boss error", err: String(err) })));

function mailerFrom(e: Env): email.Mailer | null {
  if (!e.EMAIL_FROM) return null;
  if (e.EMAIL_PROVIDER === "smtp" && e.SMTP_URL) return email.createMailer({ provider: "smtp", smtpUrl: e.SMTP_URL, from: e.EMAIL_FROM });
  if (e.EMAIL_PROVIDER === "resend" && e.RESEND_API_KEY) return email.createMailer({ provider: "resend", apiKey: e.RESEND_API_KEY, from: e.EMAIL_FROM });
  return null;
}

await boss.start();
await registerJobs(boss, { db, ch, secret: env.AUTH_SECRET, mailer: mailerFrom(env), dashboardUrl: env.DASHBOARD_URL ?? null });
console.log(JSON.stringify({ msg: "roost worker started" }));

async function shutdown() {
  await boss.stop();
  await pool.end();
  await ch.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
