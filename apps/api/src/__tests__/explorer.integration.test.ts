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

type Page = { events: { id: string; name: string; player_id: string; props: string }[]; next: { at: string; id: string } | null };

describe.skipIf(!ready)("event explorer (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };

  const get = async <T>(path: string, who = cookie) => {
    const res = await app.request(`/admin${path}`, { headers: { cookie: who } });
    return { status: res.status, body: (await res.json()) as T };
  };
  const event = (name: string, playerId: string, props: Record<string, string | number | boolean>, minutesAgo = 1) => ({
    id: randomUUID(),
    name,
    ts: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    sessionId: "s1",
    playerId,
    props,
  });

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    cookie = await signIn(app, mailer, `explore-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Explore ${run}`);
    const events = [
      event("level_start", "p1", { level: "forest-3" }, 5),
      event("level_complete", "p1", { level: "forest-3", stars: 3 }, 4),
      event("level_start", "p2", { level: "cave-1" }, 3),
      event("purchase", "p2", { sku: "gems_100", first: true }, 2),
      ...Array.from({ length: 105 }, (_, i) => event("tick", "p3", { i }, 10 + i)),
    ];
    const res = await app.request("/v1/events", {
      method: "POST",
      headers: { "x-roost-key": studio.key, "content-type": "application/json" },
      body: JSON.stringify({ context: { build: "3.1", platform: "android", sdk: "test" }, events }),
    });
    expect(res.status).toBe(202);
  });

  afterAll(async () => {
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
    await ch?.close();
  });

  const base = () => `/environments/${studio.envId}/events`;

  it("filters by name, player and any prop (strings, numbers and booleans)", async () => {
    expect((await get<Page>(`${base()}?name=level_start`)).body.events.map((e) => e.player_id).sort()).toEqual(["p1", "p2"]);
    expect((await get<Page>(`${base()}?player=p2`)).body.events).toHaveLength(2);
    expect((await get<Page>(`${base()}?propKey=level&propValue=forest-3`)).body.events).toHaveLength(2);
    expect((await get<Page>(`${base()}?propKey=stars&propValue=3`)).body.events[0]?.name).toBe("level_complete");
    expect((await get<Page>(`${base()}?propKey=first&propValue=true`)).body.events[0]?.name).toBe("purchase");
    expect(JSON.parse((await get<Page>(`${base()}?name=purchase`)).body.events[0]?.props ?? "{}")).toMatchObject({ sku: "gems_100" });
  });

  it("pages newest first without repeats", async () => {
    const first = await get<Page>(`${base()}?range=7d`);
    expect(first.body.events).toHaveLength(100);
    expect(first.body.events[0]?.name).toBe("purchase");
    const next = first.body.next;
    expect(next).not.toBeNull();
    const second = await get<Page>(`${base()}?range=7d&before=${encodeURIComponent(next?.at ?? "")}&beforeId=${next?.id}`);
    expect(second.body.events).toHaveLength(9);
    expect(second.body.next).toBeNull();
    const ids = new Set([...first.body.events, ...second.body.events].map((e) => e.id));
    expect(ids.size).toBe(109);
  });

  it("charts and lists the filter options", async () => {
    const series = await get<{ series: { events: number; players: number }[] }>(`${base()}/series?name=level_start`);
    expect(series.body.series.reduce((n, s) => n + s.events, 0)).toBe(2);
    const facets = await get<{ names: { value: string; count: number }[]; builds: { value: string }[] }>(`${base()}/facets?range=7d`);
    expect(facets.body.names[0]).toEqual({ value: "tick", count: 105 });
    expect(facets.body.builds.map((b) => b.value)).toEqual(["3.1"]);
  });

  it("rejects bad filters and hides other studios' events", async () => {
    expect((await get(`${base()}?range=1y`)).status).toBe(400);
    const stranger = await signIn(app, mailer, `stranger-${run}@test.roost`);
    expect((await get(base(), stranger)).status).toBe(404);
  });

  it("builds install-day cohorts with D1 and later retention", async () => {
    const DAY = 24 * 60;
    const events = [event("session_start", "r1", {}, 3 * DAY), event("session_start", "r1", {}, 2 * DAY), event("session_start", "r2", {}, 3 * DAY)];
    await app.request("/v1/events", {
      method: "POST",
      headers: { "x-roost-key": studio.key, "content-type": "application/json" },
      body: JSON.stringify({ context: { build: "3.0", platform: "android", sdk: "test" }, events }),
    });
    type Retention = { cohorts: { day: string; size: number; retained: Record<string, number> }[]; average: Record<string, number | null> };
    const res = await get<Retention>(`/environments/${studio.envId}/retention?build=3.0`);
    expect(res.status).toBe(200);
    const [cohort] = res.body.cohorts;
    expect(cohort).toMatchObject({ size: 2, retained: { 0: 2, 1: 1, 2: 0 } });
    expect(cohort?.retained[3]).toBeUndefined();
    expect(res.body.average[1]).toBe(0.5);
    expect((await get(`/environments/${studio.envId}/retention?days=7`)).status).toBe(400);
  });

  it("finds players and shows one player's history", async () => {
    type Players = { players: { player_id: string; events: number }[] };
    const all = await get<Players>(`/environments/${studio.envId}/players`);
    expect(all.body.players.map((p) => p.player_id)).toEqual(expect.arrayContaining(["p1", "p2", "p3"]));
    expect((await get<Players>(`/environments/${studio.envId}/players?q=P3`)).body.players).toEqual([expect.objectContaining({ player_id: "p3", events: 105 })]);
    type Profile = { profile: { events: number; sessions: number; topEvents: { name: string }[]; crashes: unknown[] }; reports: unknown[] };
    const p2 = await get<Profile>(`/environments/${studio.envId}/players/p2`);
    expect(p2.body.profile).toMatchObject({ events: 2, sessions: 1 });
    expect(p2.body.profile.topEvents.map((t) => t.name).sort()).toEqual(["level_start", "purchase"]);
    expect((await get(`/environments/${studio.envId}/players/nobody`)).status).toBe(404);
  });
});
