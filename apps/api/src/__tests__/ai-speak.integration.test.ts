import { randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { createDb, orgs, users } from "@roost/db";
import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { memoryMailer, setupStudio, signIn, testAuthDeps, testExtras } from "./helpers.ts";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const ready = Boolean(process.env.DATABASE_URL && process.env.CLICKHOUSE_URL);

const AUDIO = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 7, 7, 7]);

/** Stands in for OpenRouter's /audio/speech (answers with bytes; `status` can be changed between tests) and its
 *  generation endpoint, which reports what the call cost. */
function fakeSpeech() {
  const state = { status: 200, calls: [] as { url: string; headers: Headers; body: Record<string, unknown> }[] };
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes("/generation?id=gen-tts-1")) return Response.json({ data: { id: "gen-tts-1", total_cost: 0.00125 } });
    state.calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    if (state.status !== 200) return new Response(JSON.stringify({ error: { code: state.status, message: "Bad voice" } }), { status: state.status, headers: { "content-type": "application/json" } });
    return new Response(AUDIO, { headers: { "content-type": "audio/mpeg", "x-generation-id": "gen-tts-1" } });
  };
  return { state, fetch: fetch as typeof globalThis.fetch };
}

/** Speech calls still being logged (their cost is looked up after the response). */
const pending: Promise<void>[] = [];

describe.skipIf(!ready)("AI speech (integration)", () => {
  // Every call's log finishes before the next test (and before the database closes).
  afterEach(() => Promise.all(pending.splice(0)));

  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  const upstream = fakeSpeech();
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };

  const say = (body: unknown, target = app) =>
    target.request("/v1/ai/speak", { method: "POST", headers: { "content-type": "application/json", "x-roost-key": studio.key }, body: JSON.stringify(body) });
  const line = { template: "narrator", text: "Happy birthday, Sam!", voice: "alloy", playerId: "p1" };

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: "test-key", fetch: upstream.fetch, later: (work: Promise<void>) => pending.push(work), costWaits: [0] }, ...testExtras() });
    cookie = await signIn(app, mailer, `speak-${run}@test.roost`);
    studio = await setupStudio(app, cookie, `Speak ${run}`);
    const keyRes = await app.request(`/admin/environments/${studio.envId}/keys`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ kind: "server" }) });
    const serverKey = ((await keyRes.json()) as { raw: string }).raw;
    const push = await app.request("/v1/manage/config", {
      method: "PUT",
      headers: { "x-roost-key": serverKey, "content-type": "application/json" },
      body: JSON.stringify({ speech: { narrator: { model: "openai/gpt-4o-mini-tts", voices: ["alloy", "nova"], maxChars: 40, instructions: "Warm and unhurried." } } }),
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

  it("speaks a line with a client key, returns the audio and logs the characters", async () => {
    const res = await say(line);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("x-roost-model")).toBe("openai/gpt-4o-mini-tts");
    expect(res.headers.get("x-roost-chars")).toBe(String(line.text.length));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(AUDIO);
    const sent = upstream.state.calls.at(-1);
    expect(sent?.url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(sent?.headers.get("authorization")).toBe("Bearer test-key");
    expect(sent?.body).toEqual({ model: "openai/gpt-4o-mini-tts", input: line.text, voice: "alloy", response_format: "mp3", instructions: "Warm and unhurried." });
    // The call is logged once its real cost comes back from OpenRouter, after the audio was sent.
    await Promise.all(pending.splice(0));
    const logged = await ch.query({ query: "SELECT template, template_version, model, status, tokens_in, tokens_out, cost_usd FROM ai_calls WHERE game_id = {g:UUID}", query_params: { g: studio.gameId }, format: "JSONEachRow" });
    expect(await logged.json()).toEqual([expect.objectContaining({ template: "narrator", template_version: 1, model: "openai/gpt-4o-mini-tts", status: "ok", tokens_in: line.text.length, tokens_out: 0, cost_usd: 0.00125 })]);
  });

  it("lets a call replace the template's instructions", async () => {
    const res = await say({ ...line, playerId: "p-instr", instructions: "Whisper." });
    expect(res.status).toBe(200);
    expect(upstream.state.calls.at(-1)?.body).toMatchObject({ instructions: "Whisper." });
  });

  it("refuses voices the template doesn't list, text over maxChars, and unknown templates", async () => {
    const calls = upstream.state.calls.length;
    const voice = await say({ ...line, playerId: "p-bad", voice: "onyx" });
    expect(voice.status).toBe(400);
    expect(await voice.json()).toMatchObject({ error: { code: "bad_request" } });
    const long = await say({ ...line, playerId: "p-bad", text: "x".repeat(41) });
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ error: { code: "bad_request" } });
    const instr = await say({ ...line, playerId: "p-bad", instructions: "x".repeat(301) });
    expect(instr.status).toBe(400);
    const missing = await say({ ...line, playerId: "p-bad", template: "nope" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "not_found" } });
    expect(upstream.state.calls.length).toBe(calls);
  });

  it("reports an upstream refusal as upstream_error", async () => {
    upstream.state.status = 400;
    const res = await say({ ...line, playerId: "p2" });
    upstream.state.status = 200;
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "upstream_error" } });
  });

  it("counts characters against the player's daily budget, and 503s without an API key", async () => {
    // p1 has spoken 20 characters today; a 10-character daily budget is used up.
    const limits = { monthlyCapCents: 5000, playerDailyTokens: 10, playerPerMinute: 100 };
    const set = await app.request(`/admin/games/${studio.gameId}/ai/limits`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(limits) });
    expect(set.status).toBe(200);
    const limited = await say(line);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "rate_limited" } });
    expect((await say({ ...line, playerId: "fresh" })).status).toBe(200);
    const off = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    expect((await say(line, off)).status).toBe(503);
  });
});
