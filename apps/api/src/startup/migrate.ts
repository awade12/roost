import { runMigrations, type Clickhouse } from "@roost/clickhouse";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { createDb } from "@roost/db";

/**
 * Arbitrary but fixed: every API replica asks Postgres for the same advisory lock,
 * so only one of them migrates at a time and the others wait, then find nothing to do.
 */
export const MIGRATION_LOCK_KEY = 7_268_011_001;

type Pool = ReturnType<typeof createDb>["pool"];

export type MigrationDirs = { postgres: string; clickhouse: string };

/**
 * Brings Postgres (drizzle's migrator, same journal as `drizzle-kit migrate`) and ClickHouse
 * (the runner in @roost/clickhouse) up to date. Both run under one Postgres advisory lock,
 * held on a single connection for the whole run. Returns the ClickHouse files it applied.
 */
export async function applyMigrations(pool: Pool, ch: Clickhouse, dirs: MigrationDirs): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      await migrate(drizzle(client), { migrationsFolder: dirs.postgres });
      return await runMigrations(ch, dirs.clickhouse);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
