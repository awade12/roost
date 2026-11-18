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

type Changes = { changes: { kind: string; name: string; result: string; error?: string }[]; applied: boolean };

const FILE = {
  templates: { npc_greeting: { model: "openai/gpt-4o-mini", userTemplate: "Greet {{name}}", systemPrompt: "Be brief." } },
  decisions: {
    message_kind: {
      model: "liquid/d1.2",
      questions: {
        kind: { type: "choice", instructions: "What kind of message?", criteria: { hi: "A greeting", vent: "Letting off steam" } },
        warmth: { type: "score", instructions: "How warm is it?", criteria: ["cold", "neutral", "warm"] },
      },
    },
  },
  speech: { narrator: { model: "openai/gpt-4o-mini-tts", voices: ["alloy", "nova"], instructions: "Warm." } },
  flags: {
    new_shop: { type: "boolean", value: false, rollout: { percent: 25, value: true } },
    "enemy.tuning": { type: "json", value: { hp: 100 } },
  },
  aiLimits: { monthlyCapCents: 2000, playerDailyTokens: 5000, playerPerMinute: 5 },
};

describe.skipIf(!ready)("management and query API with server keys (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let studio = { orgId: "", gameId: "", envId: "", key: "" };
  let serverKey = "";

  const call = (method: string, path: string, body?: unknown, key = serverKey) =>
    app.request(`/v1${path}`, { method, headers: { "x-roost-key": key, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const results = (c: Changes) => Object.fromEntries(c.changes.map((x) => [`${x.kind}:${x.name}`, x.result]));

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    const cookie = await signIn(app, mailer, `manage-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Manage ${run}`);
    const res = await app.request(`/admin/environments/${studio.envId}/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ kind: "server" }) });
    serverKey = ((await res.json()) as { raw: string }).raw;
  });

  afterAll(async () => {
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
    await ch?.close();
  });

  it("lets any real key download SDKs, and nothing else", async () => {
    // No SDK files in tests: a 404 means the key passed the check.
    expect((await app.request("/sdk/js/roost-sdk-1.0.0.tgz")).status).toBe(401);
    expect((await app.request("/sdk/js/roost-sdk-1.0.0.tgz?key=rk_client_madeup")).status).toBe(401);
    expect((await app.request(`/sdk/js/roost-sdk-1.0.0.tgz?key=${studio.key}`)).status).toBe(404);
    expect((await app.request("/sdk/cargo/ro/os/roost-sdk", { headers: { authorization: serverKey } })).status).toBe(404);
  });

  it("refuses client keys", async () => {
    expect((await call("GET", "/manage/config", undefined, studio.key)).status).toBe(403);
    expect((await call("GET", "/query/issues", undefined, studio.key)).status).toBe(403);
  });

  it("applies a config file, then reports nothing to change", async () => {
    const first = await json<Changes>(call("PUT", "/manage/config", FILE));
    expect(results(first)).toEqual({ "template:npc_greeting": "created", "decision:message_kind": "created", "speech:narrator": "created", "flag:new_shop": "created", "flag:enemy.tuning": "created", "aiLimits:aiLimits": "updated" });
    const again = await json<Changes>(call("PUT", "/manage/config", FILE));
    expect(results(again)).toEqual({ "template:npc_greeting": "unchanged", "decision:message_kind": "unchanged", "speech:narrator": "unchanged", "flag:new_shop": "unchanged", "flag:enemy.tuning": "unchanged", "aiLimits:aiLimits": "unchanged" });
    // Games see the pushed flag straight away.
    const cfg = await json<{ flags: Record<string, { value: unknown }> }>(call("GET", "/config?playerId=p1", undefined, studio.key));
    expect(cfg.flags["enemy.tuning"]?.value).toEqual({ hp: 100 });
  });

  it("previews with dry_run, prunes, and refuses type changes", async () => {
    const edited = { ...FILE, flags: { new_shop: { type: "boolean", value: true } } };
    const preview = await json<Changes>(call("PUT", "/manage/config?dry_run=true&prune=true", edited));
    expect(preview.applied).toBe(false);
    expect(results(preview)).toMatchObject({ "flag:new_shop": "updated", "flag:enemy.tuning": "deleted" });
    expect(Object.keys((await json<{ flags: object }>(call("GET", "/manage/config"))).flags)).toHaveLength(2);
    await call("PUT", "/manage/config?prune=true", edited);
    expect(Object.keys((await json<{ flags: object }>(call("GET", "/manage/config"))).flags)).toEqual(["new_shop"]);
    const typeChange = await call("PUT", "/manage/config", { flags: { new_shop: { type: "string", value: "x" } } });
    expect(typeChange.status).toBe(422);
  });

  it("updates, previews and prunes decisions, and pulls them back", async () => {
    type Pulled = { decisions: Record<string, { questions: Record<string, unknown> }> };
    const kind = FILE.decisions.message_kind;
    const edited = { decisions: { message_kind: { ...kind, questions: { ...kind.questions, is_rude: { type: "noul", instructions: "Rude?" } } } } };
    expect(results(await json<Changes>(call("PUT", "/manage/config", edited)))).toMatchObject({ "decision:message_kind": "updated" });
    expect(Object.keys((await json<Pulled>(call("GET", "/manage/config"))).decisions.message_kind?.questions ?? {}).sort()).toEqual(["is_rude", "kind", "warmth"]);
    const preview = await json<Changes>(call("PUT", "/manage/config?dry_run=true&prune=true", { ...FILE, decisions: {} }));
    expect(results(preview)).toMatchObject({ "decision:message_kind": "deleted" });
    expect(Object.keys((await json<Pulled>(call("GET", "/manage/config"))).decisions)).toEqual(["message_kind"]);
    await call("PUT", "/manage/config?prune=true", { ...FILE, decisions: {} });
    expect((await json<Pulled>(call("GET", "/manage/config"))).decisions).toEqual({});
    const bad = await call("PUT", "/manage/config", { decisions: { x: { model: "liquid/d1.2", questions: { q: { type: "box", instructions: "?" } } } } });
    expect(bad.status).toBe(400);
  });

  it("updates, prunes and pulls speech templates, with defaults filled in", async () => {
    type Pulled = { speech: Record<string, { voices: string[]; format: string; maxChars: number; instructions?: string }> };
    expect((await json<Pulled>(call("GET", "/manage/config"))).speech).toEqual({ narrator: { model: "openai/gpt-4o-mini-tts", voices: ["alloy", "nova"], format: "mp3", maxChars: 500, instructions: "Warm." } });
    const edited = { speech: { narrator: { model: "openai/gpt-4o-mini-tts", voices: ["alloy"], format: "pcm", maxChars: 1000 } } };
    expect(results(await json<Changes>(call("PUT", "/manage/config", edited)))).toMatchObject({ "speech:narrator": "updated" });
    expect((await json<Pulled>(call("GET", "/manage/config"))).speech.narrator).toEqual({ model: "openai/gpt-4o-mini-tts", voices: ["alloy"], format: "pcm", maxChars: 1000 });
    expect(results(await json<Changes>(call("PUT", "/manage/config", edited)))).toMatchObject({ "speech:narrator": "unchanged" });
    await call("PUT", "/manage/config?prune=true", { ...FILE, speech: {} });
    expect((await json<Pulled>(call("GET", "/manage/config"))).speech).toEqual({});
    const bad = await call("PUT", "/manage/config", { speech: { x: { model: "openai/gpt-4o-mini-tts", voices: ["alloy"], maxChars: 5000 } } });
    expect(bad.status).toBe(400);
  });

  it("manages single items and reads data", async () => {
    expect((await call("PUT", "/manage/flags/spawn_rate", { type: "number", value: 1.5 })).status).toBe(201);
    expect((await call("PUT", "/manage/flags/spawn_rate", { type: "number", value: "fast" })).status).toBe(400);
    expect((await call("DELETE", "/manage/flags/spawn_rate")).status).toBe(200);
    expect((await call("PUT", "/manage/templates/shop_hint", { model: "openai/gpt-4o-mini", userTemplate: "Hint" })).status).toBe(201);
    expect((await call("DELETE", "/manage/templates/nope")).status).toBe(404);
    expect((await call("GET", "/query/issues")).status).toBe(200);
    expect((await call("GET", "/query/events?range=7d")).status).toBe(200);
    expect((await call("GET", "/query/retention")).status).toBe(200);
  });
});
