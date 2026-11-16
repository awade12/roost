import { createClient } from "@clickhouse/client";
import { z } from "zod";

export const ClickhouseEnvSchema = z.object({
  CLICKHOUSE_URL: z.url(),
  CLICKHOUSE_USER: z.string().min(1),
  CLICKHOUSE_PASSWORD: z.string(),
  CLICKHOUSE_DB: z.string().min(1),
});

export type ClickhouseEnv = z.infer<typeof ClickhouseEnvSchema>;

export function createClickhouse(env: ClickhouseEnv) {
  return createClient({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    database: env.CLICKHOUSE_DB,
    clickhouse_settings: {
      // Games send many small batches. Async inserts let ClickHouse merge them
      // server-side; waiting means a 202 still means "stored".
      async_insert: 1,
      wait_for_async_insert: 1,
    },
  });
}

export type Clickhouse = ReturnType<typeof createClickhouse>;
