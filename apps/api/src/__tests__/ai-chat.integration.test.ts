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

/** Fake OpenRouter: plain JSON, or SSE chunks when the request asks to stream. */
function fakeOpenRouter() {
  const calls: Record<string, unknown>[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push(body);
    if (!body.stream) {
      return new Response(JSON.stringify({ model: "test/model-a", choices: [{ message: { content: "Plain answer." } }], usage: { prompt_tokens: 9, completion_tokens: 3 } }));
    }
    const lines = [
      ": OPENROUTER PROCESSING",
      `data: ${JSON.stringify({ model: "test/model-b", choices: [{ delta: { content: "Keep " } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "your guard up." } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 5, cost: 0.0001 } })}`,
      "data: [DONE]",
    ];
    return new Response(new Blob([lines.join("\n\n") + "\n\n"]).stream(), { headers: { "content-type": "text/event-stream" } });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

describe.skipIf(!ready)("AI proxy: chat, options, streaming, server calls (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  const openRouter = fakeOpenRouter();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let studio = { orgId: "", gameId: "", envId: "", key: "" };
  let serverKey = "";

  const post = (path: string, body: unknown, key = studio.key) =>
    app.request(`/v1${path}`, { method: "POST", headers: { "content-type": "application/json", "x-roost-key": key }, body: JSON.stringify(body) });
  const ask = { template: "coach", vars: { q: "How do I block?" }, playerId: "p1" };

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: "test-key", fetch: openRouter.fetch }, ...testExtras() });
    const cookie = await signIn(app, mailer, `aichat-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `AI chat ${run}`);
    const res = await app.request(`/admin/environments/${studio.envId}/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ kind: "server" }) });
    serverKey = ((await res.json()) as { raw: string }).raw;
    const template = { model: "test/model-a", fallbackModels: ["test/model-b"], systemPrompt: "You are a coach.", userTemplate: "Q: {{q}}", maxTokens: 200, temperature: 0.5 };
    expect((await app.request("/v1/manage/templates/coach", { method: "PUT", headers: { "x-roost-key": serverKey, "content-type": "application/json" }, body: JSON.stringify(template) })).status).toBe(201);
  });

  afterAll(async () => {
    await ch?.command({ query: `DELETE FROM ai_calls WHERE game_id = '${studio.gameId}'` });
    await ch?.close();
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("puts history between the system prompt and the template message, within the template's bounds", async () => {
    const history = [
      { role: "user", content: "Hi coach" },
      { role: "assistant", content: "Gloves up." },
    ];
    const res = await post("/ai/run", { ...ask, messages: history, options: { model: "test/model-b", maxTokens: 999, temperature: 0.1 } });
    expect(res.status).toBe(200);
    const sent = openRouter.calls.at(-1) as { messages: { role: string; content: string }[]; models: string[]; max_tokens: number; temperature: number };
    expect(sent.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(sent.messages.at(-1)?.content).toBe("Q: How do I block?");
    expect(sent.models).toEqual(["test/model-b", "test/model-a"]);
    expect(sent.max_tokens).toBe(200);
    expect(sent.temperature).toBe(0.1);
    const other = await post("/ai/run", { ...ask, options: { model: "openai/gpt-5" } });
    expect(other.status).toBe(400);
  });

  it("streams deltas, then done with the model and usage", async () => {
    const res = await post("/ai/run", { ...ask, stream: true });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    const events = text
      .split("\n\n")
      .filter((b) => b.includes("event:"))
      .map((b) => ({ event: /event: (\w+)/.exec(b)?.[1], data: JSON.parse(/data: (.*)/.exec(b)?.[1] ?? "null") as Record<string, unknown> }));
    expect(events.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).toBe("Keep your guard up.");
    expect(events.at(-1)).toEqual({ event: "done", data: { model: "test/model-b", usage: { tokensIn: 12, tokensOut: 5 } } });
  });

  it("allows free-form calls only with a server key", async () => {
    const body = { model: "anthropic/claude-haiku-4.5", messages: [{ role: "user", content: "Summarize today's reports" }] };
    expect((await post("/ai/complete", body)).status).toBe(403);
    const res = await post("/ai/complete", body, serverKey);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toBe("Plain answer.");
    expect((openRouter.calls.at(-1) as { model: string }).model).toBe("anthropic/claude-haiku-4.5");
  });
});
