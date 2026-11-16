import { randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import type { analytics } from "@roost/core";
import { createDb, orgs, users } from "@roost/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { memoryMailer, signIn, testAuthDeps, testExtras } from "./helpers.ts";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const ready = Boolean(process.env.DATABASE_URL && process.env.CLICKHOUSE_URL);

type Overview = Awaited<ReturnType<typeof analytics.getOverview>>;

describe.skipIf(!ready)("GET /admin/environments/:id/overview (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let envId = "";

  // A noon timestamp `daysAgo` days back, in ClickHouse's DateTime64 text format.
  const at = (daysAgo: number) => {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().replace("T", " ").replace("Z", "");
  };
  const event = (player: string, daysAgo: number, name = "level_start", id = randomUUID()) => ({
    id,
    environment_id: envId,
    name,
    player_id: player,
    session_id: "s",
    build: "1.0.0",
    platform: "ios",
    props: {},
    occurred_at: at(daysAgo),
  });

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    cookie = await signIn(app, mailer, `analyst-${run}@test.roost`);
    const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;
    const post = (path: string, body: unknown) =>
      app.request(`/admin${path}`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    orgId = String((await json(await post("/orgs", { name: "Analytics test" }))).id);
    await post(`/orgs/${orgId}/games`, { name: "Retention Test" });
    const list = await app.request(`/admin/orgs/${orgId}/games`, { headers: { cookie } });
    const { games } = (await list.json()) as { games: { environments: { id: string }[] }[] };
    envId = games[0]?.environments[0]?.id ?? "";

    const dup = randomUUID();
    // a, b start 3 days ago; a returns the next day. c starts 2 days ago and returns the next day.
    await ch.insert({
      table: "events",
      format: "JSONEachRow",
      values: [
        event("a", 3, "level_start", dup),
        event("a", 3, "level_start", dup), // an SDK retry: must count once
        event("b", 3),
        event("a", 2),
        event("c", 2),
        event("c", 1),
        { ...event("c", 0, "shop_open"), occurred_at: new Date().toISOString().replace("T", " ").replace("Z", "") },
      ],
    });
  });

  afterAll(async () => {
    await ch?.command({ query: `DELETE FROM events WHERE environment_id = '${envId}'` });
    await ch?.close();
    if (orgId) await db.delete(orgs).where(eq(orgs.id, orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  const overview = async (query = "") => {
    const res = await app.request(`/admin/environments/${envId}/overview${query}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    return (await res.json()) as Overview;
  };

  it("counts players, events and new players per day", async () => {
    const o = await overview("?days=7");
    expect(o.hasEvents).toBe(true);
    expect(o.days).toHaveLength(7);
    const [d3, d2, d1] = o.days.slice(-4, -1);
    expect(d3).toMatchObject({ players: 2, events: 2, newPlayers: 2 });
    expect(d2).toMatchObject({ players: 2, newPlayers: 1 });
    expect(d1).toMatchObject({ players: 1, newPlayers: 0 });
  });

  it("computes D1 retention from complete cohorts only", async () => {
    const { d1 } = await overview();
    expect(d1).toMatchObject({ cohort: 3, retained: 2 });
    expect(d1.rate).toBeCloseTo(2 / 3);
  });

  it("lists the last 24 hours' top events", async () => {
    const { topEvents } = await overview();
    expect(topEvents).toContainEqual({ name: "shop_open", count: 1 });
  });

  it("rejects an invalid range and other people's environments", async () => {
    expect((await app.request(`/admin/environments/${envId}/overview?days=5`, { headers: { cookie } })).status).toBe(400);
    const stranger = await signIn(app, mailer, `stranger-${run}@test.roost`);
    const res = await app.request(`/admin/environments/${envId}/overview`, { headers: { cookie: stranger } });
    expect(res.status).toBe(404);
  });
});
