import { randomUUID } from "node:crypto";
import type { Clickhouse } from "@roost/clickhouse";
import { rateLimits as limitsCore } from "@roost/core";
import { createDb, rateLimits, users } from "@roost/db";
import { like, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createLimiter, memoryRateStore, postgresRateStore } from "../http/rate-limit/index.ts";
import { memoryMailer, testAuthDeps, testExtras } from "./helpers.ts";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const databaseUrl = process.env.DATABASE_URL;

describe("memory rate store", () => {
  it("counts per key and throws once over the limit", async () => {
    const limiter = createLimiter(memoryRateStore(), { name: "t", limit: 2, windowMs: 60_000 });
    await limiter.hit("a");
    await limiter.hit("a");
    await expect(limiter.hit("a")).rejects.toMatchObject({ code: "rate_limited" });
    await expect(limiter.hit("b")).resolves.toBeUndefined();
  });
});

describe.skipIf(!databaseUrl)("Postgres rate store (integration)", () => {
  const { db, pool } = createDb(databaseUrl ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);

  afterAll(async () => {
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("shares one count between stores, as between API replicas", async () => {
    const opts = { name: `t-${run}`, limit: 3, windowMs: 60_000 };
    const a = createLimiter(postgresRateStore(db), opts);
    const b = createLimiter(postgresRateStore(db), opts);
    await a.hit("k");
    await b.hit("k");
    await a.hit("k");
    await expect(b.hit("k")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("counts concurrent hits exactly (atomic upsert)", async () => {
    const store = postgresRateStore(db);
    const key = `burst-${run}`;
    const counts = await Promise.all(Array.from({ length: 20 }, () => store.hit(key, 60_000)));
    expect([...counts].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("stores hashed keys only and when each window ends", async () => {
    const email = `secret-${run}@test.roost`;
    await createLimiter(postgresRateStore(db), { name: "otp-email", limit: 3, windowMs: 60_000 }).hit(email);
    const leaked = await db.select().from(rateLimits).where(like(rateLimits.key, `%secret-${run}%`));
    expect(leaked).toEqual([]);
    const { rows } = await db.execute<{ ok: boolean }>(sql`SELECT bool_and(expires_at > window_start) AS ok FROM rate_limits`);
    expect(rows[0]?.ok).toBe(true);
  });

  it("prunes windows that have ended, and only those", async () => {
    const store = postgresRateStore(db);
    await store.hit(`old-${run}`, 1);
    await store.hit(`live-${run}`, 60_000);
    await new Promise((r) => setTimeout(r, 5));
    await limitsCore.pruneExpired(db);
    const left = await db.select({ key: rateLimits.key }).from(rateLimits).where(like(rateLimits.key, `%-${run}`));
    expect(left.map((r) => r.key)).toContain(`live-${run}`);
    expect(left.map((r) => r.key)).not.toContain(`old-${run}`);
  });

  it("applies the sign-in limit across two app instances", async () => {
    const shared = postgresRateStore(db);
    const make = () =>
      createApp({ db, ch: {} as Clickhouse, auth: testAuthDeps(memoryMailer()), ai: { apiKey: undefined }, ...testExtras(), rateLimits: shared });
    const [one, two] = [make(), make()];
    const email = `shared-${run}@test.roost`;
    // A different IP each time, so only the per-email limit (3 per 15 minutes) applies.
    const start = (app: typeof one, i: number) =>
      app.request("/admin/auth/otp/start", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${i}.${run.charCodeAt(0)}` },
        body: JSON.stringify({ email }),
      });
    expect((await start(one, 1)).status).toBe(200);
    expect((await start(two, 2)).status).toBe(200);
    expect((await start(one, 3)).status).toBe(200);
    expect((await start(two, 4)).status).toBe(429);
  });
});
