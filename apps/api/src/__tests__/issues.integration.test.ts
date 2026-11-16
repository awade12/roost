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

type Issue = { id: string; number: number; status: string; regressedAt: string | null; events: number; players: number };

const crash = (screen: string, line: number, player = "p1", id = randomUUID()) => ({
  id,
  kind: "crash",
  type: "TypeError",
  message: "Cannot read properties of undefined (reading 'inventory')",
  stack: `TypeError: Cannot read properties of undefined\n    at ${screen} (index.bundle:${line}:12)\n    at render (index.bundle:${line + 40}:3)`,
  ts: new Date().toISOString(),
  sessionId: "s1",
  playerId: player,
  breadcrumbs: [
    { name: "session_start", ts: new Date(Date.now() - 2000).toISOString() },
    { name: "shop_open", ts: new Date(Date.now() - 200).toISOString() },
  ],
});

describe.skipIf(!ready)("crash reports and issues (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };

  const send = (...crashes: unknown[]) =>
    app.request("/v1/crashes", {
      method: "POST",
      headers: { "content-type": "application/json", "x-roost-key": studio.key },
      body: JSON.stringify({ context: { build: "1.4.2", platform: "ios", sdk: "test" }, crashes }),
    });
  const admin = (path: string, init: RequestInit = {}) =>
    app.request(`/admin${path}`, { ...init, headers: { cookie, "content-type": "application/json" } });
  const list = async (status = "unresolved") =>
    ((await (await admin(`/environments/${studio.envId}/issues?status=${status}`)).json()) as { issues: Issue[] }).issues;

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    cookie = await signIn(app, mailer, `crash-${run}@test.roost`);
    studio = await setupStudio(app, cookie);
  });

  afterAll(async () => {
    await ch?.command({ query: `DELETE FROM crash_events WHERE environment_id = '${studio.envId}'` });
    await ch?.close();
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("groups the same crash from different builds into one issue, retries counted once", async () => {
    const first = crash("ShopScreen", 4021, "p1");
    expect((await send(first, crash("ShopScreen", 4100, "p2"))).status).toBe(202);
    expect((await send(first)).status).toBe(202); // retry of the same report
    const [issue, ...rest] = await list();
    expect(rest).toHaveLength(0);
    expect(issue).toMatchObject({ number: 1, events: 2, players: 2, status: "unresolved" });
  });

  it("opens a separate, numbered issue for a different crash site", async () => {
    await send(crash("InventoryScreen", 10));
    expect((await list()).map((i) => i.number).sort()).toEqual([1, 2]);
  });

  it("shows the latest stack, breadcrumbs and breakdowns in the detail", async () => {
    const issue = (await list()).find((i) => i.number === 1);
    const body = (await (await admin(`/issues/${issue?.id}`)).json()) as {
      issue: { culprit: string };
      detail: { latest: { breadcrumbs: { name: string }[]; stack: string }; platforms: { name: string; count: number }[] };
    };
    expect(body.issue.culprit).toContain("ShopScreen");
    expect(body.detail.latest.breadcrumbs.map((b) => b.name)).toEqual(["session_start", "shop_open"]);
    expect(body.detail.platforms).toEqual([{ name: "ios", count: 2 }]);
  });

  it("marks a resolved issue as regressed when it happens again", async () => {
    const issue = (await list()).find((i) => i.number === 1);
    await admin(`/issues/${issue?.id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
    expect((await list("resolved")).map((i) => i.id)).toContain(issue?.id);

    await send(crash("ShopScreen", 5000, "p3"));
    const again = (await list()).find((i) => i.id === issue?.id);
    expect(again?.status).toBe("unresolved");
    expect(again?.regressedAt).not.toBeNull();
  });

  it("hides issues from people outside the studio", async () => {
    const issue = (await list())[0];
    const stranger = await signIn(app, mailer, `stranger-${run}@test.roost`);
    const res = await app.request(`/admin/issues/${issue?.id}`, { headers: { cookie: stranger } });
    expect(res.status).toBe(404);
  });
});
