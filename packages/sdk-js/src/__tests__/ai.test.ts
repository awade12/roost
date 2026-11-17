import { describe, expect, it, vi } from "vitest";
import { RoostAiError } from "../ai/index.ts";
import { Roost } from "../client.ts";

function sse(blocks: string[]) {
  return new Response(new Blob([blocks.join("\n\n") + "\n\n"]).stream(), { headers: { "content-type": "text/event-stream" } });
}

function client(response: () => Response) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
  const roost = new Roost({ endpoint: "https://roost.test", clientKey: "k", playerId: "p1", context: { build: "1", platform: "web" }, fetch, flushIntervalMs: 60_000 });
  return { roost, fetch };
}

const sent = (fetch: ReturnType<typeof client>["fetch"]) => JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Record<string, unknown>;

describe("AI proxy calls", () => {
  it("sends history and options only when given", async () => {
    const { roost, fetch } = client(() => new Response(JSON.stringify({ text: "Hi", model: "m", usage: { tokensIn: 1, tokensOut: 1 } })));
    await roost.ai("coach", { q: "x" }, { messages: [{ role: "user", content: "Hello" }], model: "a/b", maxTokens: 50 });
    expect(sent(fetch)).toEqual({ template: "coach", vars: { q: "x" }, playerId: "p1", messages: [{ role: "user", content: "Hello" }], options: { model: "a/b", maxTokens: 50 } });
  });

  it("streams text pieces and resolves with the whole answer", async () => {
    const { roost, fetch } = client(() =>
      sse([`event: delta\ndata: {"text":"Keep "}`, `event: delta\ndata: {"text":"moving."}`, `event: done\ndata: {"model":"m","usage":{"tokensIn":3,"tokensOut":2}}`]),
    );
    const pieces: string[] = [];
    const result = await roost.aiStream("coach", {}, { onDelta: (t) => pieces.push(t) });
    expect(pieces).toEqual(["Keep ", "moving."]);
    expect(result).toEqual({ text: "Keep moving.", model: "m", usage: { tokensIn: 3, tokensOut: 2 } });
    expect(sent(fetch).stream).toBe(true);
  });

  it("turns a stream error into RoostAiError", async () => {
    const { roost } = client(() => sse([`event: error\ndata: {"code":"rate_limited","message":"Budget used"}`]));
    const error = await roost.aiStream("coach", {}, { onDelta: () => undefined }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RoostAiError);
    expect((error as RoostAiError).code).toBe("rate_limited");
  });

  it("decides: posts the decision and state, returns the answers", async () => {
    const answers = { kind: { type: "choice", choice: "vent", confidence: 0.8, probabilities: { vent: 0.8, hi: 0.2 } } };
    const { roost, fetch } = client(() => new Response(JSON.stringify({ answers, model: "m", usage: { tokensIn: 5, tokensOut: 1 } })));
    const result = await roost.decide("message_kind", { message: "ugh, work", to: "Mum" });
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://roost.test/v1/ai/decide");
    expect(sent(fetch)).toEqual({ decision: "message_kind", state: { message: "ugh, work", to: "Mum" }, playerId: "p1" });
    expect(result.answers.kind).toEqual(answers.kind);
  });

  it("turns a failed decision into RoostAiError", async () => {
    const { roost } = client(() => new Response(JSON.stringify({ error: { code: "not_found", message: "No AI decision" } }), { status: 404 }));
    const error = await roost.decide("nope", "hi").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RoostAiError);
    expect((error as RoostAiError).code).toBe("not_found");
  });
});
