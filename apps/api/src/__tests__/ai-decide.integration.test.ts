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

const QUESTIONS = {
  kind: { type: "choice", instructions: "What kind of message is this?", criteria: { hi: "A greeting", vent: "Letting off steam", joke: "Trying to be funny" } },
  is_rude: { type: "noul", instructions: "Is the message rude?" },
};

/** Stands in for OpenRouter's Decisions API; `status` can be changed between tests. */
function fakeDecisions() {
  const state = { status: 200, calls: [] as { url: string; headers: Headers; body: Record<string, unknown> }[] };
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    state.calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (state.status !== 200) return new Response(JSON.stringify({ error: { code: state.status, message: "Bad questions" } }), { status: state.status });
    const body = {
      id: "gen-dec-1",
      model: "liquid/d1.2",
      answers: {
        kind: { type: "choice", choice: "vent", confidence: 0.81, probabilities: { hi: 0.09, vent: 0.81, joke: 0.1 } },
        is_rude: { type: "noul", noul: 0.04 },
      },
      usage: { input_tokens: 120, output_tokens: 8, cost: 0.00002 },
    };
    return new Response(JSON.stringify(body));
  };
  return { state, fetch: fetch as typeof globalThis.fetch };
}

describe.skipIf(!ready)("AI decisions (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  const upstream = fakeDecisions();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };

  const decide = (body: unknown, target = app) =>
    target.request("/v1/ai/decide", { method: "POST", headers: { "content-type": "application/json", "x-roost-key": studio.key }, body: JSON.stringify(body) });
  const ask = { decision: "message_kind", state: { message: "ugh, work was awful", to: "Mum" }, playerId: "p1" };

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: "test-key", fetch: upstream.fetch }, ...testExtras() });
    cookie = await signIn(app, mailer, `decide-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Decide ${run}`);
    const keyRes = await app.request(`/admin/environments/${studio.envId}/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ kind: "server" }) });
    const serverKey = ((await keyRes.json()) as { raw: string }).raw;
    const push = await app.request("/v1/manage/config", {
      method: "PUT",
      headers: { "x-roost-key": serverKey, "content-type": "application/json" },
      body: JSON.stringify({ decisions: { message_kind: { model: "liquid/d1.2", questions: QUESTIONS } } }),
    });
    expect(push.status).toBe(200);
  });

  afterAll(async () => {
    await ch?.command({ query: `DELETE FROM ai_calls WHERE game_id = '${studio.gameId}'` });
    await ch?.close();
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("runs a decision with a client key and logs the call", async () => {
    const res = await decide(ask);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      answers: {
        kind: { type: "choice", choice: "vent", confidence: 0.81, probabilities: { hi: 0.09, vent: 0.81, joke: 0.1 } },
        is_rude: { type: "noul", noul: 0.04 },
      },
      model: "liquid/d1.2",
      usage: { tokensIn: 120, tokensOut: 8 },
    });
    const sent = upstream.state.calls.at(-1);
    expect(sent?.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(sent?.headers.get("authorization")).toBe("Bearer test-key");
    expect(sent?.body).toEqual({ model: "liquid/d1.2", state: ask.state, questions: QUESTIONS });
    const logged = await ch.query({ query: "SELECT template, template_version, status, tokens_in, cost_usd FROM ai_calls WHERE game_id = {g:UUID}", query_params: { g: studio.gameId }, format: "JSONEachRow" });
    expect(await logged.json()).toEqual([expect.objectContaining({ template: "message_kind", template_version: 1, status: "ok", tokens_in: 120 })]);
  });

  it("answers 404 for an unknown decision and 400 for a bad body", async () => {
    const missing = await decide({ ...ask, decision: "nope" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "not_found" } });
    const bad = await decide({ ...ask, state: { nested: { a: 1 } } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "bad_request" } });
  });

  it("reports an upstream refusal as upstream_error", async () => {
    upstream.state.status = 400;
    const res = await decide({ ...ask, playerId: "p2" });
    upstream.state.status = 200;
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "upstream_error" } });
  });

  it("applies the game's AI limits, and 503s without an API key", async () => {
    const limits = { monthlyCapCents: 5000, playerDailyTokens: 20000, playerPerMinute: 1 };
    const set = await app.request(`/admin/games/${studio.gameId}/ai/limits`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(limits) });
    expect(set.status).toBe(200);
    const limited = await decide(ask); // p1 already made one call this minute
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "rate_limited" } });
    const off = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    expect((await decide(ask, off)).status).toBe(503);
  });
});
