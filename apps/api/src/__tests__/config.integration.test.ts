import { randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { createDb, orgs, users } from "@roost/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { memoryMailer, setupStudio, signIn, testAuthDeps, testExtras } from "./helpers.ts";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const ready = Boolean(process.env.DATABASE_URL && process.env.CLICKHOUSE_URL);

type Config = { flags: Record<string, { value: unknown; variant: string; reason: string }>; version: string };

describe.skipIf(!ready)("config and flags (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };
  let flagId = "";

  const admin = (method: string, path: string, body?: unknown, who = cookie) =>
    app.request(`/admin${path}`, { method, headers: { cookie: who, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const fetchConfig = (playerId: string, etag?: string) =>
    app.request(`/v1/config?playerId=${playerId}`, { headers: { "x-roost-key": studio.key, ...(etag ? { "if-none-match": etag } : {}) } });

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    cookie = await signIn(app, mailer, `config-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Config ${run}`);
  });

  afterAll(async () => {
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
    await ch?.close();
  });

  it("creates flags and rejects values that don't fit the type", async () => {
    const shop = { key: "new_shop", type: "boolean", value: false, rollout: { percent: 100, value: true }, overrides: { tester: false } };
    const res = await admin("POST", `/environments/${studio.envId}/flags`, shop);
    expect(res.status).toBe(201);
    flagId = ((await res.json()) as { id: string }).id;
    expect((await admin("POST", `/environments/${studio.envId}/flags`, shop)).status).toBe(409);
    expect((await admin("POST", `/environments/${studio.envId}/flags`, { key: "bad", type: "number", value: "3" })).status).toBe(400);
    expect((await admin("POST", `/environments/${studio.envId}/flags`, { key: "Bad Key", type: "string", value: "x" })).status).toBe(400);
    const tuning = { key: "enemy.tuning", type: "json", value: { hp: 100, speed: 1.2 } };
    expect((await admin("POST", `/environments/${studio.envId}/flags`, tuning)).status).toBe(201);
  });

  it("resolves flags per player with OpenFeature reasons", async () => {
    const body = (await (await fetchConfig("someone")).json()) as Config;
    expect(body.flags.new_shop).toMatchObject({ value: true, variant: "rollout", reason: "SPLIT" });
    expect(body.flags["enemy.tuning"]).toMatchObject({ value: { hp: 100, speed: 1.2 }, reason: "STATIC" });
    const tester = (await (await fetchConfig("tester")).json()) as Config;
    expect(tester.flags.new_shop).toMatchObject({ value: false, variant: "override", reason: "TARGETING_MATCH" });
    expect((await app.request("/v1/config", { headers: { "x-roost-key": studio.key } })).status).toBe(400);
  });

  it("answers 304 until a flag changes", async () => {
    const first = await fetchConfig("someone");
    const etag = first.headers.get("etag") ?? "";
    expect((await fetchConfig("someone", etag)).status).toBe(304);
    const update = await admin("PUT", `/flags/${flagId}`, { value: true, rollout: null, overrides: {} });
    expect(update.status).toBe(200);
    const after = await fetchConfig("tester", etag);
    expect(after.status).toBe(200);
    expect(((await after.json()) as Config).flags.new_shop).toMatchObject({ value: true, reason: "STATIC" });
    expect((await admin("PUT", `/flags/${flagId}`, { value: "yes" })).status).toBe(400);
  });

  it("hides flags from other studios and deletes them", async () => {
    const stranger = await signIn(app, mailer, `stranger-${run}@test.roost`);
    expect((await admin("GET", `/environments/${studio.envId}/flags`, undefined, stranger)).status).toBe(404);
    expect((await admin("DELETE", `/flags/${flagId}`, undefined, stranger)).status).toBe(404);
    expect((await admin("DELETE", `/flags/${flagId}`)).status).toBe(200);
    const list = (await (await admin("GET", `/environments/${studio.envId}/flags`)).json()) as { flags: unknown[] };
    expect(list.flags).toHaveLength(1);
  });
});
