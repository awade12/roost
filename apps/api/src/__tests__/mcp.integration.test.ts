import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { createDb, issueActivity, issues, orgs, users } from "@roost/db";
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

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

const crash = (player: string) => ({
  id: randomUUID(),
  kind: "crash",
  type: "TypeError",
  message: "Cannot read properties of undefined (reading 'inventory')",
  stack: "TypeError: Cannot read properties of undefined\n    at SaveSystem.load (index.bundle:88:21)\n    at Game.resume (index.bundle:212:9)",
  ts: new Date().toISOString(),
  sessionId: "s1",
  playerId: player,
  breadcrumbs: [{ name: "save_loaded", ts: new Date(Date.now() - 1800).toISOString() }],
});

describe.skipIf(!ready)("MCP endpoint (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let studio = { orgId: "", gameId: "", envId: "", key: "" };
  let other = { orgId: "", gameId: "", envId: "", key: "" };
  let serverKey = "";
  let client: Client;
  const reportId = randomUUID();

  const ingest = (path: string, key: string, body: unknown) =>
    app.request(`/v1${path}`, { method: "POST", headers: { "x-roost-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });
  const tool = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
  const data = <T>(r: ToolResult) => JSON.parse(r.content[0]?.text ?? "null") as T;

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    const cookie = await signIn(app, mailer, `mcp-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `MCP ${run}`);
    other = await setupStudio(app, cookie, `Other ${run}`);
    const created = await app.request(`/admin/environments/${studio.envId}/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ kind: "server" }) });
    serverKey = ((await created.json()) as { raw: string }).raw;

    const context = { build: "1.4.2", platform: "ios", sdk: "test" };
    await ingest("/crashes", studio.key, { context, crashes: [crash("p1"), crash("p2")] });
    await ingest("/crashes", other.key, { context, crashes: [crash("someone-else")] });
    await ingest("/reports", studio.key, { context, report: { id: reportId, ts: new Date().toISOString(), playerId: "p1", category: "bug", message: "Fell through the floor", email: "player@example.com" } });
    await app.request("/v1/manage/flags/new_shop", { method: "PUT", headers: { "x-roost-key": serverKey, "content-type": "application/json" }, body: JSON.stringify({ type: "boolean", value: false }) });

    // The real SDK client over Streamable HTTP, talking to the app in-process.
    client = new Client({ name: "roost-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://roost.test/mcp"), {
      fetch: (url, init) => Promise.resolve(app.request(String(url), init)),
      requestInit: { headers: { authorization: `Bearer ${serverKey}` } },
    });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    for (const org of [studio.orgId, other.orgId]) if (org) await db.delete(orgs).where(eq(orgs.id, org));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
    await ch?.close();
  });

  it("lists the tools with read-only hints on the reads", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_ai_usage", "get_issue", "get_overview", "get_player", "get_report", "get_retention", "list_flags", "list_issues", "list_reports", "query_events", "set_flag_value", "set_issue_status", "set_report_status"]);
    expect(tools.find((t) => t.name === "get_issue")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "set_issue_status")?.annotations?.readOnlyHint).toBe(false);
  });

  it("needs a server key: no key is 401, a client key is 403", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const none = await app.request("/mcp", { method: "POST", headers, body });
    expect(none.status).toBe(401);
    expect(await none.json()).toMatchObject({ error: { message: expect.stringContaining("Authorization: Bearer") } });
    expect((await app.request("/mcp", { method: "POST", headers: { ...headers, authorization: `Bearer ${studio.key}` }, body })).status).toBe(403);
  });

  it("lists issues, reads one by number, and resolves it with an actor-less activity entry", async () => {
    const list = data<{ number: number; id: string; type: string; events: number }[]>(await tool("list_issues"));
    expect(list).toHaveLength(1);
    const number = list[0]?.number ?? 0;

    const detail = await tool("get_issue", { issue: number });
    const got = data<{ issue: { type: string }; latest: { stack: string; breadcrumbs: { name: string }[] }; players: number }>(detail);
    expect(got.issue.type).toBe("TypeError");
    expect(got.latest.stack).toContain("SaveSystem.load");
    expect(got.latest.breadcrumbs.map((b) => b.name)).toEqual(["save_loaded"]);
    expect(got.players).toBe(2);

    expect(data<{ status: string }>(await tool("set_issue_status", { issue: number, status: "resolved" })).status).toBe("resolved");
    expect(data<unknown[]>(await tool("list_issues"))).toHaveLength(0);
    const activity = await db.select().from(issueActivity).where(eq(issueActivity.issueId, list[0]?.id ?? ""));
    expect(activity.at(-1)).toMatchObject({ kind: "status", userId: null, data: { from: "unresolved", to: "resolved", via: "mcp" } });
  });

  it("never reaches another game's issue", async () => {
    const [theirs] = await db.select({ id: issues.id }).from(issues).where(eq(issues.environmentId, other.envId));
    const otherIssue = theirs?.id ?? "";
    expect(otherIssue).not.toBe("");
    const res = await tool("get_issue", { issue: otherIssue });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/No issue/);
    expect((await tool("set_issue_status", { issue: otherIssue, status: "ignored" })).isError).toBe(true);
  });

  it("reads and closes a bug report without exposing the player's email", async () => {
    const list = data<{ id: string; playerLeftEmail: boolean }[]>(await tool("list_reports"));
    expect(list.map((r) => r.id)).toEqual([reportId]);
    expect(list[0]?.playerLeftEmail).toBe(true);
    const report = await tool("get_report", { report_id: reportId });
    expect(report.content[0]?.text).not.toContain("player@example.com");
    expect(data<{ report: { message: string } }>(report).report.message).toBe("Fell through the floor");
    await tool("set_report_status", { report_id: reportId, status: "closed" });
    expect(data<unknown[]>(await tool("list_reports"))).toHaveLength(0);
  });

  it("changes a flag's default only with a value of the right type", async () => {
    expect((await tool("set_flag_value", { key: "new_shop", value: "yes" })).isError).toBe(true);
    expect(data<{ previous: unknown }>(await tool("set_flag_value", { key: "new_shop", value: true })).previous).toBe(false);
    const flags = data<{ key: string; value: unknown }[]>(await tool("list_flags"));
    expect(flags.find((f) => f.key === "new_shop")?.value).toBe(true);
    expect((await tool("set_flag_value", { key: "missing", value: true })).isError).toBe(true);
  });

  it("answers the analytics and AI reads", async () => {
    expect(data<{ hasEvents: boolean }>(await tool("get_overview", { days: "7" }))).toHaveProperty("hasEvents");
    expect(data<{ events: unknown[] }>(await tool("query_events", { range: "1h" }))).toHaveProperty("events");
    expect(data<{ limits: { monthlyCapUsd: number } }>(await tool("get_ai_usage")).limits.monthlyCapUsd).toBeGreaterThan(0);
    expect((await tool("get_player", { player_id: "nobody" })).isError).toBe(true);
  });
});
