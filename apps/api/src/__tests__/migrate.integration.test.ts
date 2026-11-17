import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { createDb } from "@roost/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../env.ts";
import { applyMigrations, MIGRATION_LOCK_KEY } from "../startup/migrate.ts";

// Needs Postgres + ClickHouse (`pnpm db:up`). Reads the repo's .env and skips without it.
try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const ready = Boolean(process.env.DATABASE_URL && process.env.CLICKHOUSE_URL);

describe("MIGRATE_ON_START", () => {
  const base = { ...process.env, DATABASE_URL: "postgres://u:p@localhost/db", AUTH_SECRET: "x".repeat(32) };
  const required = {
    EMAIL_PROVIDER: "smtp",
    SMTP_URL: "smtp://localhost:1025",
    EMAIL_FROM: "Roost <a@b.c>",
    CLICKHOUSE_URL: "http://localhost:8123",
    CLICKHOUSE_USER: "roost",
    CLICKHOUSE_PASSWORD: "roost",
    CLICKHOUSE_DB: "roost",
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "roost",
    S3_ACCESS_KEY: "k",
    S3_SECRET_KEY: "s",
  };

  it("defaults to true and accepts false/0", () => {
    expect(loadEnv({ ...base, ...required, MIGRATE_ON_START: undefined }).MIGRATE_ON_START).toBe(true);
    expect(loadEnv({ ...base, ...required, MIGRATE_ON_START: "false" }).MIGRATE_ON_START).toBe(false);
    expect(loadEnv({ ...base, ...required, MIGRATE_ON_START: "0" }).MIGRATE_ON_START).toBe(false);
  });

  it("rejects anything else", () => {
    expect(() => loadEnv({ ...base, ...required, MIGRATE_ON_START: "yes" })).toThrow(/MIGRATE_ON_START/);
  });
});

describe.skipIf(!ready)("startup migrations (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  let ch: Clickhouse;
  const dirs = { postgres: "../../packages/db/migrations", clickhouse: "../../packages/clickhouse/migrations" };

  beforeAll(() => {
    if (env) ch = createClickhouse(env);
  });
  afterAll(async () => {
    await pool.end();
    await ch.close();
  });

  it("is idempotent and safe to run from two replicas at once", async () => {
    // The first run catches up whatever is pending; after that both stores are current.
    await applyMigrations(pool, ch, dirs);
    const [a, b] = await Promise.all([applyMigrations(pool, ch, dirs), applyMigrations(pool, ch, dirs)]);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    // The lock is released afterwards: another session can take it straight away.
    const client = await pool.connect();
    try {
      const lock = await client.query("SELECT pg_try_advisory_lock($1) AS got", [MIGRATION_LOCK_KEY]);
      expect(lock.rows[0]).toEqual({ got: true });
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  });
});
