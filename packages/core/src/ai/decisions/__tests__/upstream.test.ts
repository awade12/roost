import { describe, expect, it } from "vitest";
import { UpstreamError } from "../../upstream/openrouter.ts";
import { decide, parseDecision } from "../upstream.ts";

// The example response from OpenRouter's Decisions API docs.
const SAMPLE = {
  id: "gen-dec-1",
  model: "typesafe/jev-1.13-20260917",
  provider: "TypeSafe",
  answers: {
    is_bug: { type: "noul", noul: 0.96 },
    team: { type: "choice", choice: "payments", confidence: 0.75, probabilities: { account: 0, frontend: 0.16, payments: 0.84 } },
    urgency: { type: "score", score: 1.99, confidence: 0.99, probabilities: { "0": 0, "1": 0.01, "2": 0.99 }, legend: { "0": "low", "1": "medium", "2": "high" }, extra: "ignored" },
  },
  usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
};

describe("Decisions API response parser", () => {
  it("parses answers, usage and cost, dropping unknown fields", () => {
    const result = parseDecision(SAMPLE, "liquid/d1.2");
    expect(result).toEqual({
      answers: {
        is_bug: { type: "noul", noul: 0.96 },
        team: { type: "choice", choice: "payments", confidence: 0.75, probabilities: { account: 0, frontend: 0.16, payments: 0.84 } },
        urgency: { type: "score", score: 1.99, confidence: 0.99, probabilities: { "0": 0, "1": 0.01, "2": 0.99 }, legend: { "0": "low", "1": "medium", "2": "high" } },
      },
      model: "typesafe/jev-1.13-20260917",
      tokensIn: 476,
      tokensOut: 70,
      costUsd: 0.000019992,
    });
  });

  it("fills in what's missing that the game doesn't need", () => {
    const result = parseDecision({ answers: { team: { type: "choice", choice: "a", confidence: 0.5 } } }, "liquid/d1.2");
    expect(result).toMatchObject({ model: "liquid/d1.2", tokensIn: 0, costUsd: 0, answers: { team: { probabilities: {} } } });
  });

  it("refuses responses it can't use", () => {
    expect(() => parseDecision(null, "m")).toThrow(UpstreamError);
    expect(() => parseDecision({ answers: { x: { type: "box", boxes: [] } } }, "m")).toThrow(UpstreamError);
    expect(() => parseDecision({ answers: { x: { type: "noul", noul: "high" } } }, "m")).toThrow(UpstreamError);
  });

  it("sends model, state and questions, and turns HTTP errors into UpstreamError", async () => {
    let sent: { url: string; body: unknown } | undefined;
    const ok = (async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify(SAMPLE));
    }) as typeof fetch;
    const questions = { is_bug: { type: "noul" as const, instructions: "Bug?" } };
    await decide({ apiKey: "k", model: "liquid/d1.2", state: { message: "hi" }, questions, fetch: ok });
    expect(sent).toEqual({ url: "https://openrouter.ai/api/alpha/decisions", body: { model: "liquid/d1.2", state: { message: "hi" }, questions } });
    const bad = (async () => new Response(JSON.stringify({ error: { code: 400, message: "bad" } }), { status: 400 })) as typeof fetch;
    await expect(decide({ apiKey: "k", model: "m/x", state: "hi", questions, fetch: bad })).rejects.toThrow("HTTP 400");
  });
});
