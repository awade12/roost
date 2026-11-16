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

describe.skipIf(!ready)("player reports (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };
  const reportId = randomUUID();
  const screenshotId = randomUUID();

  const admin = async (method: string, path: string, body?: unknown, who = cookie) =>
    app.request(`/admin${path}`, { method, headers: { cookie: who, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const send = (report: Record<string, unknown>) =>
    app.request("/v1/reports", {
      method: "POST",
      headers: { "x-roost-key": studio.key, "content-type": "application/json" },
      body: JSON.stringify({ context: { build: "2.0", platform: "ios", sdk: "test" }, report }),
    });
  const report = {
    id: reportId,
    ts: new Date().toISOString(),
    playerId: "p1",
    category: "bug",
    message: "  The bridge on level 4 has no collision  ",
    email: "player@example.com",
    tags: { level: "4" },
    breadcrumbs: [{ name: "level_start", ts: new Date().toISOString() }],
    attachments: [{ id: screenshotId, name: "screenshot.png", contentType: "image/png", size: 4 }],
  };

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    cookie = await signIn(app, mailer, `reports-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Reports ${run}`);
  });

  afterAll(async () => {
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
    await ch?.close();
  });

  it("accepts a report and its screenshot, and stores retries once", async () => {
    expect((await send(report)).status).toBe(202);
    expect((await send(report)).status).toBe(202);
    const put = await app.request(`/v1/reports/${reportId}/attachments/${screenshotId}`, {
      method: "PUT",
      headers: { "x-roost-key": studio.key, "content-type": "image/png", "x-filename": "screenshot.png" },
      body: new Uint8Array([137, 80, 78, 71]),
    });
    expect(put.status).toBe(201);
  });

  it("rejects bad reports without a key or with a bad email", async () => {
    expect((await send({ ...report, id: randomUUID(), email: "not-an-email" })).status).toBe(400);
    const anon = await app.request("/v1/reports", { method: "POST", body: "{}" });
    expect(anon.status).toBe(401);
  });

  it("lists and shows reports to the studio, with trimmed text and attachments", async () => {
    const list = await json<{ reports: { id: string; hasEmail: boolean; message: string }[] }>(admin("GET", `/environments/${studio.envId}/reports`));
    expect(list.reports).toHaveLength(1);
    expect(list.reports[0]?.hasEmail).toBe(true);
    expect(list.reports[0]?.message).toBe("The bridge on level 4 has no collision");
    const detail = await json<{ report: { email: string; tags: Record<string, string>; build: string }; attachments: { id: string }[] }>(admin("GET", `/reports/${reportId}`));
    expect(detail.report.email).toBe("player@example.com");
    expect(detail.report.tags.level).toBe("4");
    expect(detail.report.build).toBe("2.0");
    expect(detail.attachments[0]?.id).toBe(screenshotId);
    const file = await admin("GET", `/attachments/${screenshotId}`);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("closes reports and only links issues from the same environment", async () => {
    expect((await admin("PATCH", `/reports/${reportId}`, { status: "closed" })).status).toBe(200);
    const open = await json<{ reports: unknown[] }>(admin("GET", `/environments/${studio.envId}/reports`));
    expect(open.reports).toHaveLength(0);
    const closed = await json<{ reports: unknown[] }>(admin("GET", `/environments/${studio.envId}/reports?status=closed`));
    expect(closed.reports).toHaveLength(1);
    expect((await admin("PUT", `/reports/${reportId}/issue`, { issueId: randomUUID() })).status).toBe(400);
    expect((await admin("PUT", `/reports/${reportId}/issue`, { issueId: null })).status).toBe(200);
  });

  it("hides reports from other studios", async () => {
    const stranger = await signIn(app, mailer, `stranger-${run}@test.roost`);
    expect((await admin("GET", `/reports/${reportId}`, undefined, stranger)).status).toBe(404);
  });
});
