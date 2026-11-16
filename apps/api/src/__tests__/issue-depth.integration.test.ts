import { randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { createDb, integrations, orgs, users } from "@roost/db";
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

/** Fake Linear GraphQL API: one team, and issueCreate returns ROO-1. */
function fakeLinear() {
  const queries: string[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body)) as { query: string };
    queries.push(query);
    const data = query.includes("teams")
      ? { teams: { nodes: [{ id: "team-1", name: "Game", key: "ROO" }] } }
      : { issueCreate: { success: true, issue: { identifier: "ROO-1", url: "https://linear.app/x/issue/ROO-1" } } };
    return new Response(JSON.stringify({ data }));
  };
  return { queries, fetch: fetch as typeof globalThis.fetch };
}

describe.skipIf(!ready)("issue depth: SDK data, attachments, collaboration, Linear (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  const linear = fakeLinear();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };
  let issueId = "";
  const crashId = randomUUID();
  const attachmentId = randomUUID();

  const admin = async (method: string, path: string, body?: unknown, who = cookie) =>
    app.request(`/admin${path}`, { method, headers: { cookie: who, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const v1 = (path: string, init: RequestInit) => app.request(`/v1${path}`, { ...init, headers: { "x-roost-key": studio.key, ...init.headers } });
  const report = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    kind: "error",
    level: "warning",
    type: "SaveError",
    message: "Save slot 2 is corrupt",
    stack: "SaveError: Save slot 2 is corrupt\n    at loadSlot (save.ts:40:3)",
    ts: new Date().toISOString(),
    sessionId: "s",
    playerId: "p1",
    tags: { slot: "2", mode: "ranked" },
    contexts: { match: { round: 3, opponent: "bot" } },
    extra: { saveVersion: 7 },
    ...overrides,
  });
  const sendReports = (...crashes: unknown[]) =>
    v1("/crashes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: { build: "2.0.0", platform: "android", sdk: "test" }, crashes }) });

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras(linear.fetch) });
    cookie = await signIn(app, mailer, `depth-${run}@test.roost`);
    studio = await setupStudio(app, cookie);
    const res = await sendReports(report({ id: crashId, attachments: [{ id: attachmentId, name: "save-2.json", contentType: "application/json", size: 15 }] }));
    expect(res.status).toBe(202);
    issueId = (await json<{ issues: { id: string }[] }>(admin("GET", `/environments/${studio.envId}/issues`))).issues[0]?.id ?? "";
  });

  afterAll(async () => {
    await ch?.command({ query: `DELETE FROM crash_events WHERE environment_id = '${studio.envId}'` });
    await ch?.close();
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("keeps the tags, contexts, extra and level the SDK sent", async () => {
    const { events } = await json<{ events: { id: string; level: string }[] }>(admin("GET", `/issues/${issueId}/events`));
    expect(events).toEqual([expect.objectContaining({ id: crashId, level: "warning" })]);
    const event = await json<{ tags: Record<string, string>; contexts: unknown; extra: unknown }>(admin("GET", `/issues/${issueId}/events/${crashId}`));
    expect(event).toMatchObject({ tags: { slot: "2", mode: "ranked" }, contexts: { match: { round: 3 } }, extra: { saveVersion: 7 } });
    const detail = await json<{ tags: { key: string }[] }>(admin("GET", `/issues/${issueId}`));
    expect(detail.tags.map((t) => t.key).sort()).toEqual(["mode", "slot"]);
  });

  it("stores an uploaded save file and serves it only as a download", async () => {
    const put = await v1(`/crashes/${crashId}/attachments/${attachmentId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-filename": encodeURIComponent("save-2.json") },
      body: '{"gold":12345}',
    });
    expect(put.status).toBe(201);
    const event = await json<{ attachments: { id: string; name: string; size: number }[] }>(admin("GET", `/issues/${issueId}/events/${crashId}`));
    expect(event.attachments).toEqual([expect.objectContaining({ id: attachmentId, name: "save-2.json", size: 14 })]);
    const file = await admin("GET", `/attachments/${attachmentId}`);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(await file.text()).toBe('{"gold":12345}');
  });

  it("rejects attachments over 10 MB", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await v1(`/crashes/${crashId}/attachments/${randomUUID()}`, { method: "PUT", headers: { "x-filename": "big.bin" }, body: big });
    expect(res.status).toBe(413);
  });

  it("groups by a developer-supplied fingerprint", async () => {
    await sendReports(report({ type: "A", stack: "at a (a.ts:1)", fingerprint: ["net-timeout"] }), report({ type: "B", stack: "at b (b.ts:1)", fingerprint: ["net-timeout"] }));
    const { issues } = await json<{ issues: { type: string; events: number }[] }>(admin("GET", `/environments/${studio.envId}/issues`));
    expect(issues.find((i) => i.type === "A" || i.type === "B")?.events).toBe(2);
  });

  it("supports comments, labels, assignee and a full activity log", async () => {
    const comment = await json<{ id: string }>(admin("POST", `/issues/${issueId}/comments`, { body: "Repro: corrupt slot after update" }));
    const label = await json<{ id: string }>(admin("POST", `/games/${studio.gameId}/labels`, { name: "save-system", color: "blue" }));
    expect((await admin("PUT", `/issues/${issueId}/labels/${label.id}`, { on: true })).status).toBe(200);
    const me = await json<{ id: string }>(admin("GET", "/me"));
    expect((await admin("PUT", `/issues/${issueId}/assignee`, { userId: me.id })).status).toBe(200);
    expect((await admin("PUT", `/issues/${issueId}/assignee`, { userId: randomUUID() })).status).toBe(400);
    await admin("PATCH", `/issues/${issueId}`, { status: "resolved" });

    const { activity } = await json<{ activity: { kind: string; body: string | null }[] }>(admin("GET", `/issues/${issueId}/activity`));
    expect(activity.map((a) => a.kind)).toEqual(["comment", "labeled", "assigned", "status"]);
    const list = await json<{ issues: { id: string; labels: { name: string }[]; assigneeId: string }[] }>(admin("GET", `/environments/${studio.envId}/issues?status=resolved`));
    expect(list.issues.find((i) => i.id === issueId)).toMatchObject({ labels: [{ name: "save-system" }], assigneeId: me.id });

    const stranger = await signIn(app, mailer, `other-${run}@test.roost`);
    expect((await admin("DELETE", `/issues/${issueId}/comments/${comment.id}`, undefined, stranger)).status).toBe(404);
    expect((await admin("DELETE", `/issues/${issueId}/comments/${comment.id}`)).status).toBe(200);
  });

  it("sends an issue to Linear once connected, and keeps the key encrypted", async () => {
    expect((await admin("POST", `/issues/${issueId}/linear`)).status).toBe(400);
    const { teams } = await json<{ teams: { id: string }[] }>(admin("POST", `/orgs/${studio.orgId}/integrations/linear/teams`, { apiKey: "lin_api_test_key_123" }));
    expect((await admin("PUT", `/orgs/${studio.orgId}/integrations/linear`, { apiKey: "lin_api_test_key_123", teamId: teams[0]?.id })).status).toBe(200);
    const [stored] = await db.select().from(integrations).where(eq(integrations.orgId, studio.orgId));
    expect(stored?.secret).not.toContain("lin_api_test_key_123");
    expect(JSON.stringify(await json(admin("GET", `/orgs/${studio.orgId}/integrations`)))).not.toContain("lin_api");

    const sent = await json<{ identifier: string }>(admin("POST", `/issues/${issueId}/linear`));
    expect(sent.identifier).toBe("ROO-1");
    expect(linear.queries.at(-1)).toContain("issueCreate");
    const again = await admin("POST", `/issues/${issueId}/linear`);
    expect(await again.json()).toMatchObject({ identifier: "ROO-1" });
    expect(linear.queries.filter((q) => q.includes("issueCreate"))).toHaveLength(1);
  });
});
