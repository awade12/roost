import { createHash, randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { apiKeys, createDb, environments, games, orgs } from "@roost/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { testAuthDeps, testExtras } from "./helpers.ts";

// Needs Postgres + ClickHouse with migrations applied (`pnpm db:up && pnpm db:migrate`).
// CI provides both. Locally it reads the repo's .env and skips if the vars are missing.
try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
function first<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error("insert returned no row");
  return row;
}

const ready = Boolean(process.env.DATABASE_URL && process.env.CLICKHOUSE_URL);

describe.skipIf(!ready)("POST /v1/events (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  let ch: Clickhouse;
  let orgId = "";
  let environmentId = "";
  const key = `ck_test_${randomUUID()}`;

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    const org = first(await db.insert(orgs).values({ name: "test" }).returning());
    const game = first(await db.insert(games).values({ orgId: org.id, name: "t", slug: "t" }).returning());
    orgId = org.id;
    environmentId = first(await db.insert(environments).values({ gameId: game.id, name: "dev" }).returning()).id;
    const hash = createHash("sha256").update(key).digest("hex");
    await db.insert(apiKeys).values({ environmentId, kind: "client", prefix: key.slice(0, 8), hash });
  });

  afterAll(async () => {
    await db.delete(orgs).where(eq(orgs.id, orgId));
    await pool.end();
    await ch?.close();
  });

  const send = (body: unknown) =>
    createApp({ db, ch, auth: testAuthDeps(), ai: { apiKey: undefined }, ...testExtras() }).request("/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-roost-key": key },
      body: JSON.stringify(body),
    });

  it("stores events and ignores retries of the same event", async () => {
    const batch = {
      context: { build: "1.0.0", platform: "ios", sdk: "test" },
      events: [
        { id: randomUUID(), name: "level_start", ts: new Date().toISOString(), sessionId: "s", playerId: "p", props: { level: 3 } },
      ],
    };
    expect((await send(batch)).status).toBe(202);
    expect((await send(batch)).status).toBe(202);

    const result = await ch.query({
      query: "SELECT count() AS n, any(props.level) AS level FROM events FINAL WHERE environment_id = {env:UUID}",
      query_params: { env: environmentId },
      format: "JSONEachRow",
    });
    const [row] = await result.json<{ n: string; level: number }>();
    expect(Number(row?.n)).toBe(1);
    expect(Number(row?.level)).toBe(3);
  });

  it("rejects an invalid batch with the standard error shape", async () => {
    const res = await send({ events: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "bad_request" } });
  });
});
