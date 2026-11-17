import { describe, expect, it } from "vitest";
import { AiDecideSchema, DecisionBodySchema, RoostConfigSchema } from "../index.ts";

const kind = {
  type: "choice",
  instructions: "What kind of message is this?",
  criteria: { hi: "A greeting", vent: "Letting off steam", joke: "Trying to be funny" },
};

describe("decision template schemas", () => {
  it("accepts the three question types", () => {
    const body = {
      model: "liquid/d1.2",
      questions: {
        kind,
        is_rude: { type: "noul", instructions: "Is it rude?" },
        is_kind: { type: "noul", instructions: "Is it kind?", criteria: { true: "warm", false: "cold" } },
        warmth: { type: "score", instructions: "How warm?", criteria: ["cold", "neutral", "warm"] },
      },
    };
    expect(DecisionBodySchema.safeParse(body).success).toBe(true);
  });

  it("rejects bad questions", () => {
    const bad = (questions: unknown) => DecisionBodySchema.safeParse({ model: "liquid/d1.2", questions }).success;
    expect(bad({})).toBe(false);
    expect(bad({ kind: { ...kind, criteria: { hi: "only one" } } })).toBe(false);
    expect(bad({ kind: { ...kind, criteria: { "Not Snake": "x", ok: "y" } } })).toBe(false);
    expect(bad({ warmth: { type: "score", instructions: "x", criteria: ["one"] } })).toBe(false);
    expect(bad({ img: { type: "box", instructions: "x" } })).toBe(false);
    expect(bad({ BadKey: { type: "noul", instructions: "x" } })).toBe(false);
    expect(bad(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`q${i}`, { type: "noul", instructions: "x" }])))).toBe(false);
  });

  it("adds decisions to the config file without breaking old ones", () => {
    expect(RoostConfigSchema.parse({}).decisions).toEqual({});
    expect(RoostConfigSchema.safeParse({ decisions: { message_kind: { model: "liquid/d1.2", questions: { kind } } } }).success).toBe(true);
  });
});

describe("POST /v1/ai/decide body", () => {
  const ok = (body: unknown) => AiDecideSchema.safeParse(body).success;

  it("takes free text or named fields as state", () => {
    expect(ok({ decision: "message_kind", state: "hey you!", playerId: "p1" })).toBe(true);
    expect(ok({ decision: "message_kind", state: { message: "hey", to: "Mum", age: 30, close: true }, playerId: "p1" })).toBe(true);
  });

  it("rejects bad requests", () => {
    expect(ok({ decision: "Message Kind", state: "hey", playerId: "p1" })).toBe(false);
    expect(ok({ decision: "message_kind", state: "", playerId: "p1" })).toBe(false);
    expect(ok({ decision: "message_kind", state: "x".repeat(8001), playerId: "p1" })).toBe(false);
    expect(ok({ decision: "message_kind", state: {}, playerId: "p1" })).toBe(false);
    expect(ok({ decision: "message_kind", state: { nested: { a: 1 } }, playerId: "p1" })).toBe(false);
    expect(ok({ decision: "message_kind", state: "hey" })).toBe(false);
  });
});
