import { randomUUID } from "node:crypto";
import { addMapping, GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { storage as storageLib, symbolication } from "@roost/core";
import { createDb, issues, orgs, users } from "@roost/db";
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

function sourceMap() {
  const gen = new GenMapping({ file: "main.js" });
  addMapping(gen, { generated: { line: 1, column: 0 }, source: "src/save/load.ts", original: { line: 42, column: 4 }, name: "loadSlot" });
  return JSON.stringify(toEncodedMap(gen));
}

describe.skipIf(!ready)("debug files and symbolication (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  const files = storageLib.memoryStorage();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };
  let serverKey = "";

  const v1 = (path: string, init: RequestInit, key = studio.key) => app.request(`/v1${path}`, { ...init, headers: { "x-roost-key": key, ...init.headers } });
  const admin = (method: string, path: string) => app.request(`/admin${path}`, { method, headers: { cookie } });

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras(), storage: files });
    cookie = await signIn(app, mailer, `symbols-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Symbols ${run}`);
    const res = await app.request(`/admin/environments/${studio.envId}/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ kind: "server" }) });
    serverKey = ((await res.json()) as { raw: string }).raw;
  });

  afterAll(async () => {
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
    await ch?.close();
  });

  it("only takes debug files from server keys, and checks them", async () => {
    const map = { method: "PUT", body: sourceMap() };
    expect((await v1("/debug-files/sourcemaps?build=2.0&name=main.js", map)).status).toBe(403);
    expect((await v1("/debug-files/sourcemaps?build=2.0&name=main.js", map, serverKey)).status).toBe(201);
    expect((await v1("/debug-files/sourcemaps?build=2.0&name=x.js", { method: "PUT", body: "{}" }, serverKey)).status).toBe(400);
    expect((await v1("/debug-files/breakpad", { method: "PUT", body: "not a sym file" }, serverKey)).status).toBe(400);
    const sym = "MODULE mac arm64 0123456789ABCDEF0123456789ABCDEF0 game\nFILE 0 src/main.rs\n";
    expect((await v1("/debug-files/breakpad", { method: "PUT", body: sym }, serverKey)).status).toBe(201);
    const listed = (await (await admin("GET", `/games/${studio.gameId}/debug-files`)).json()) as { files: { kind: string; name: string }[] };
    expect(listed.files.map((f) => `${f.kind}:${f.name}`).sort()).toEqual(["breakpad:game", "sourcemap:main.js"]);
  });

  it("maps JS crashes from builds with source maps before grouping them", async () => {
    const crash = { id: randomUUID(), kind: "error", type: "TypeError", message: "slot is undefined", stack: "TypeError: slot is undefined\n    at a (https://game.test/main.js:1:1)", ts: new Date().toISOString(), sessionId: "s", playerId: "p" };
    const res = await v1("/crashes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: { build: "2.0", platform: "web", sdk: "test" }, crashes: [crash] }) });
    expect(res.status).toBe(202);
    expect(await db.select().from(issues).where(eq(issues.environmentId, studio.envId))).toHaveLength(0);

    expect(await symbolication.processPending({ db, ch, storage: files, stackwalkBin: "minidump-stackwalk" })).toBeGreaterThanOrEqual(1);
    const [issue] = await db.select().from(issues).where(eq(issues.environmentId, studio.envId));
    expect(issue?.culprit).toBe("loadSlot (load.ts:42)");
  });

  it("checks minidump uploads", async () => {
    const id = randomUUID();
    const dump = { method: "PUT", headers: { "content-type": "application/x-minidump" } };
    expect((await v1(`/minidumps/${id}/dump`, { ...dump, body: new Uint8Array([77, 68, 77, 80, 0]) })).status).toBe(404);
    const report = { id, ts: new Date().toISOString(), playerId: "p", dumpSize: 5 };
    const post = await v1("/minidumps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ context: { build: "2.0", platform: "macos", sdk: "test" }, report }) });
    expect(post.status).toBe(202);
    expect((await v1(`/minidumps/${id}/dump`, { ...dump, body: new Uint8Array([1, 2, 3, 4]) })).status).toBe(400);
    expect((await v1(`/minidumps/${id}/dump`, { ...dump, body: new Uint8Array([77, 68, 77, 80, 0]) })).status).toBe(201);
  });
});
