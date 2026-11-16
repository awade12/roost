import { randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { alerts, issues as issueCore } from "@roost/core";
import { createDb, issues, memberships, orgs, users } from "@roost/db";
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

const DISCORD = "https://discord.com/api/webhooks/123/secret-token";

/** Records webhook posts instead of sending them. */
function fakeWebhooks() {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    posts.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(null, { status: 204 });
  };
  return { posts, fetch: fetch as typeof globalThis.fetch };
}

describe.skipIf(!ready)("game settings and alerts (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  const hooks = fakeWebhooks();
  const auth = testAuthDeps(mailer);
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };

  const admin = async (method: string, path: string, body?: unknown, who = cookie) =>
    app.request(`/admin${path}`, { method, headers: { cookie: who, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const crash = (fn: string, type = "SaveError", caller = "caller") => ({
    id: randomUUID(),
    kind: "crash",
    type,
    message: "boom",
    stack: "",
    frames: [
      { function: fn, file: "save.rs", line: 1, inApp: true },
      { function: caller, file: "game.rs", line: 2, inApp: true },
    ],
    ts: new Date().toISOString(),
    sessionId: "s",
    playerId: "p1",
  });
  const sendCrashes = (crashes: unknown[]) =>
    app.request("/v1/crashes", {
      method: "POST",
      headers: { "x-roost-key": studio.key, "content-type": "application/json" },
      body: JSON.stringify({ context: { build: "1.0", platform: "linux", sdk: "test" }, crashes }),
    });
  const saveSettings = (patch: { api?: object; issues?: object }) =>
    admin("PUT", `/games/${studio.gameId}/settings`, {
      api: { enabled: true, requestsPerMinute: 120, ...patch.api },
      issues: { groupingFrames: 3, autoResolveDays: 0, ...patch.issues },
    });
  const runAlerts = () =>
    alerts.runAlerts({ db, ch, secret: auth.secret, fetch: hooks.fetch, mailer, dashboardUrl: "https://roost.test", onlyGameId: studio.gameId });

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth, ai: { apiKey: undefined }, alerts: { fetch: hooks.fetch }, ...testExtras() });
    cookie = await signIn(app, mailer, `settings-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Settings ${run}`);
  });

  afterAll(async () => {
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
    await ch?.close();
  });

  it("returns defaults until settings are saved, and validates them", async () => {
    const body = await json<{ settings: { api: { requestsPerMinute: number } }; canEdit: boolean }>(admin("GET", `/games/${studio.gameId}/settings`));
    expect(body.settings.api.requestsPerMinute).toBe(120);
    expect(body.canEdit).toBe(true);
    expect((await saveSettings({ issues: { groupingFrames: 99 } })).status).toBe(400);
  });

  it("groups with the configured number of frames", async () => {
    await saveSettings({ issues: { groupingFrames: 1 } });
    // Same top frame, different second frame: one issue with 1 frame of grouping.
    expect((await sendCrashes([crash("load_slot", "GroupTest", "menu"), crash("load_slot", "GroupTest", "autosave")])).status).toBe(202);
    const rows = await db.select().from(issues).where(eq(issues.environmentId, studio.envId));
    expect(rows.filter((r) => r.type === "GroupTest")).toHaveLength(1);
    await saveSettings({});
  });

  it("pauses the game API and applies the per-key rate limit", async () => {
    await saveSettings({ api: { enabled: false } });
    const paused = await sendCrashes([crash("a")]);
    expect(paused.status).toBe(403);
    await saveSettings({ api: { requestsPerMinute: 10 } });
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await app.request("/v1/events", { method: "POST", headers: { "x-roost-key": studio.key } })).status);
    expect(statuses).toContain(429);
    await saveSettings({ api: { requestsPerMinute: 100_000 } });
  });

  it("renames the game and adds environments", async () => {
    expect((await admin("PATCH", `/games/${studio.gameId}`, { name: "Renamed" })).status).toBe(200);
    expect((await admin("POST", `/games/${studio.gameId}/environments`, { name: "staging" })).status).toBe(201);
    expect((await admin("POST", `/games/${studio.gameId}/environments`, { name: "staging" })).status).toBe(409);
    expect((await admin("POST", `/games/${studio.gameId}/environments`, { name: "Bad Name" })).status).toBe(400);
  });

  it("keeps at least one owner and lets owners manage members", async () => {
    const me = await json<{ members: { id: string }[] }>(admin("GET", `/orgs/${studio.orgId}/members`));
    const myId = me.members[0]?.id ?? "";
    expect((await admin("PATCH", `/orgs/${studio.orgId}/members/${myId}`, { role: "dev" })).status).toBe(409);

    const other = await signIn(app, mailer, `member-${run}@test.roost`);
    const [otherUser] = await db.select().from(users).where(eq(users.email, `member-${run}@test.roost`));
    await db.insert(memberships).values({ orgId: studio.orgId, userId: otherUser?.id ?? "", role: "viewer" });
    // Viewers can't change settings or roles.
    expect((await saveSettings({}).then(() => admin("PUT", `/games/${studio.gameId}/settings`, {}, other))).status).toBe(403);
    expect((await admin("PATCH", `/orgs/${studio.orgId}/members/${otherUser?.id}`, { role: "dev" })).status).toBe(200);
    expect((await admin("DELETE", `/orgs/${studio.orgId}/members/${otherUser?.id}`)).status).toBe(200);
    expect((await admin("PATCH", `/orgs/${studio.orgId}`, { name: "Renamed studio" })).status).toBe(200);
  });

  let channelId = "";

  it("adds channels without ever returning the webhook URL, and test-sends", async () => {
    const bad = await admin("POST", `/orgs/${studio.orgId}/alert-channels`, { kind: "discord", name: "Crashes", url: "https://example.com/x" });
    expect(bad.status).toBe(400);
    const created = await json<{ id: string; hint: string }>(admin("POST", `/orgs/${studio.orgId}/alert-channels`, { kind: "discord", name: "Crashes", url: DISCORD }));
    channelId = created.id;
    expect(created.hint).toBe("discord.com …oken");
    const listed = JSON.stringify(await json(admin("GET", `/orgs/${studio.orgId}/alert-channels`)));
    expect(listed).not.toContain("secret-token");

    expect((await admin("POST", `/orgs/${studio.orgId}/alert-channels/${channelId}/test`)).status).toBe(200);
    expect(hooks.posts.at(-1)?.url).toBe(DISCORD);
  });

  it("alerts once per new issue, and once per regression", async () => {
    const rule = (trigger: string, extra = {}) =>
      admin("POST", `/games/${studio.gameId}/alerts`, {
        name: trigger,
        environmentId: studio.envId,
        trigger,
        kinds: ["crash"],
        threshold: 50,
        windowMinutes: 60,
        cooldownMinutes: 60,
        channelIds: [channelId],
        enabled: true,
        ...extra,
      });
    expect((await rule("new_issue")).status).toBe(201);
    expect((await rule("regression")).status).toBe(201);
    hooks.posts.length = 0;

    await sendCrashes([crash("explode", "NewThing")]);
    expect((await runAlerts()).fired).toBeGreaterThanOrEqual(1);
    const embed = (hooks.posts.at(-1)?.body.embeds as { title: string; url: string }[])[0];
    expect(embed?.title).toContain("New crash in Renamed");
    expect(embed?.url).toMatch(/^https:\/\/roost\.test\/issues\//);
    expect((await runAlerts()).fired).toBe(0);

    const [issue] = await db.select().from(issues).where(eq(issues.type, "NewThing"));
    await admin("PATCH", `/issues/${issue?.id}`, { status: "resolved" });
    await new Promise((r) => setTimeout(r, 20));
    await sendCrashes([{ ...crash("explode", "NewThing"), ts: new Date().toISOString() }]);
    hooks.posts.length = 0;
    await runAlerts();
    const titles = hooks.posts.map((p) => (p.body.embeds as { title: string }[])[0]?.title);
    expect(titles).toContain("Regression in Renamed · development");
    expect((await runAlerts()).fired).toBe(0);

    const history = await json<{ history: { delivered: number }[] }>(admin("GET", `/games/${studio.gameId}/alerts`));
    expect(history.history.length).toBeGreaterThanOrEqual(2);
    expect(history.history[0]?.delivered).toBe(1);
  });

  it("alerts on a spike once per cooldown", async () => {
    await admin("POST", `/games/${studio.gameId}/alerts`, {
      name: "spike",
      environmentId: studio.envId,
      trigger: "spike",
      kinds: ["crash"],
      threshold: 3,
      windowMinutes: 10,
      cooldownMinutes: 60,
      channelIds: [channelId],
      enabled: true,
    });
    await sendCrashes([crash("spiky", "SpikeErr"), crash("spiky", "SpikeErr"), crash("spiky", "SpikeErr")]);
    hooks.posts.length = 0;
    await runAlerts();
    const titles = hooks.posts.map((p) => (p.body.embeds as { title: string }[])[0]?.title ?? "");
    expect(titles.some((t) => t.startsWith("Spike in") && t.includes("3 events in 10 min"))).toBe(true);
    hooks.posts.length = 0;
    await runAlerts();
    expect(hooks.posts.some((p) => JSON.stringify(p.body).includes("Spike in"))).toBe(false);
  });

  it("auto-resolves quiet issues when the game turns it on", async () => {
    await saveSettings({ api: { requestsPerMinute: 100_000 }, issues: { autoResolveDays: 2 } });
    await sendCrashes([crash("old_bug", "QuietErr")]);
    const old = new Date(Date.now() - 3 * 86_400_000);
    await db.update(issues).set({ lastSeenAt: old }).where(eq(issues.type, "QuietErr"));
    expect(await issueCore.autoResolve(db)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(issues).where(eq(issues.type, "QuietErr"));
    expect(row?.status).toBe("resolved");
  });
});
