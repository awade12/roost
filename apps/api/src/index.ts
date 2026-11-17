import { serve } from "@hono/node-server";
import { createClickhouse } from "@roost/clickhouse";
import { storage } from "@roost/core";
import { createDb } from "@roost/db";
import { createApp } from "./app.ts";
import { authDepsFromEnv } from "./auth-config.ts";
import { loadEnv } from "./env.ts";
import { logger } from "./http/logger.ts";
import { postgresRateStore } from "./http/rate-limit/index.ts";
import { applyMigrations } from "./startup/migrate.ts";

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
const ch = createClickhouse(env);
if (env.MIGRATE_ON_START) {
  const applied = await applyMigrations(pool, ch, { postgres: env.PG_MIGRATIONS_DIR, clickhouse: env.CH_MIGRATIONS_DIR });
  logger.info({ clickhouseApplied: applied }, "migrations applied");
}
const files = storage.createS3Storage(env);
// Don't block startup on storage; attachments just fail until it's reachable.
files.ensureBucket().catch((err: unknown) => logger.warn({ err: (err as Error).name }, "attachment bucket not ready"));
const server = serve({ fetch: createApp({
    db,
    ch,
    auth: authDepsFromEnv(env),
    storage: files,
    ai: { apiKey: env.OPENROUTER_API_KEY },
    linear: { dashboardUrl: env.DASHBOARD_URL },
    sdkDir: env.SDK_DIR,
    rateLimits: postgresRateStore(db),
  }).fetch, port: env.PORT }, (info) =>
  logger.info({ port: info.port }, "roost api listening"),
);

function shutdown() {
  server.close();
  void pool.end();
  void ch.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
