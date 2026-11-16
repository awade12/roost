import { randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
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

/** Stands in for OpenRouter: records requests and answers like the real API. */
function fakeOpenRouter(status = 200) {
  const calls: { headers: Headers; body: Record<string, unknown> }[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const body = {
      model: "test/model-a",
      choices: [{ message: { content: "Keep your guard up, Sam." } }],
      usage: { prompt_tokens: 20, completion_tokens: 6, cost: 0.0002 },
    };
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

describe.skipIf(!ready)("AI proxy (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  const openRouter = fakeOpenRouter();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let gameId = "";
  let key = "";

  const admin = (method: string, path: string, body?: unknown) =>
    app.request(`/admin${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const runAi = (target: ReturnType<typeof createApp>, body: unknown) =>
    target.request("/v1/ai/run", {
      method: "POST",
      headers: { "content-type": "application/json", "x-roost-key": key },
      body: JSON.stringify(body),
    });
  const ask = { template: "coach_chat", vars: { name: "Sam", question: "How do I block?" }, playerId: "p1" };

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: "test-key", fetch: openRouter.fetch }, ...testExtras() });
    cookie = await signIn(app, mailer, `ai-${run}@test.roost`);
    orgId = ((await (await admin("POST", "/orgs", { name: "AI test" })).json()) as { id: string }).id;
    gameId = ((await (await admin("POST", `/orgs/${orgId}/games`, { name: "Arena" })).json()) as { id: string }).id;
    const { games } = (await (await admin("GET", `/orgs/${orgId}/games`)).json()) as { games: { environments: { id: string }[] }[] };
    const envId = games[0]?.environments[0]?.id;
    key = ((await (await admin("POST", `/environments/${envId}/keys`, { kind: "client" })).json()) as { raw: string }).raw;
    const created = await admin("POST", `/games/${gameId}/ai/templates`, {
      name: "coach_chat",
      model: "test/model-a",
      fallbackModels: ["test/model-b"],
      systemPrompt: "You are a boxing coach.",
      userTemplate: "Player {{name}} asks: {{question}}",
      maxTokens: 200,
      temperature: 0.5,
    });
    expect(created.status).toBe(201);
  });

  afterAll(async () => {
    await ch?.command({ query: `DELETE FROM ai_calls WHERE game_id = '${gameId}'` });
    await ch?.close();
    if (orgId) await db.delete(orgs).where(eq(orgs.id, orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("runs a template: fills variables, sends fallbacks, never exposes the key", async () => {
    const res = await runAi(app, ask);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Keep your guard up, Sam.", model: "test/model-a", usage: { tokensIn: 20, tokensOut: 6 } });
    const sent = openRouter.calls.at(-1);
    expect(sent?.headers.get("authorization")).toBe("Bearer test-key");
    expect(sent?.body).toMatchObject({
      models: ["test/model-a", "test/model-b"],
      max_tokens: 200,
      messages: [
        { role: "system", content: "You are a boxing coach." },
        { role: "user", content: "Player Sam asks: How do I block?" },
      ],
    });
  });

  it("rejects missing variables and unknown templates", async () => {
    const missing = await runAi(app, { ...ask, vars: { name: "Sam" } });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { message: "Missing template variables: question" } });
    expect((await runAi(app, { ...ask, template: "nope" })).status).toBe(404);
  });

  it("enforces the per-player rate limit an owner sets", async () => {
    const limits = { monthlyCapCents: 5000, playerDailyTokens: 20000, playerPerMinute: 1 };
    expect((await admin("PUT", `/games/${gameId}/ai/limits`, limits)).status).toBe(200);
    const res = await runAi(app, ask); // p1 already made one call this minute
    expect(res.status).toBe(429);
    expect((await runAi(app, { ...ask, playerId: "p2" })).status).toBe(200);
  });

  it("reports upstream failures and a missing API key clearly", async () => {
    const broken = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: "k", fetch: fakeOpenRouter(500).fetch }, ...testExtras() });
    expect((await runAi(broken, { ...ask, playerId: "p3" })).status).toBe(502);
    const off = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    expect((await runAi(off, ask)).status).toBe(503);
  });

  it("shows templates, limits and usage to the dashboard, and versions edits", async () => {
    type AiView = { templates: { id: string; version: number }[]; usage: { requests30d: number; byTemplate: { template: string; errors: number }[] } };
    const view = (await (await admin("GET", `/games/${gameId}/ai`)).json()) as AiView;
    expect(view.usage.requests30d).toBeGreaterThanOrEqual(4);
    expect(view.usage.byTemplate).toContainEqual(expect.objectContaining({ template: "coach_chat", errors: 1 }));
    const tpl = view.templates[0];
    const edit = { name: "coach_chat", model: "test/model-a", fallbackModels: [], systemPrompt: "Be brief.", userTemplate: "{{question}}", maxTokens: 100, temperature: 0.2 };
    const updated = (await (await admin("PUT", `/ai/templates/${tpl?.id}`, edit)).json()) as { version: number };
    expect(updated.version).toBe((tpl?.version ?? 0) + 1);
  });
});
