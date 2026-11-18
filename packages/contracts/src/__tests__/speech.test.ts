import { describe, expect, it } from "vitest";
import { AiSpeakSchema, RoostConfigSchema, SpeechBodySchema } from "../index.ts";

describe("speech template schema", () => {
  it("fills in format and maxChars", () => {
    const parsed = SpeechBodySchema.parse({ model: "openai/gpt-4o-mini-tts", voices: ["alloy"] });
    expect(parsed).toEqual({ model: "openai/gpt-4o-mini-tts", voices: ["alloy"], format: "mp3", maxChars: 500 });
  });

  it("rejects bad templates", () => {
    const bad = (body: object) => SpeechBodySchema.safeParse({ model: "openai/gpt-4o-mini-tts", voices: ["alloy"], ...body }).success;
    expect(bad({ voices: [] })).toBe(false);
    expect(bad({ voices: Array.from({ length: 201 }, (_, i) => `v${i}`) })).toBe(false);
    expect(bad({ format: "wav" })).toBe(false);
    expect(bad({ maxChars: 3001 })).toBe(false);
    expect(bad({ maxChars: 0 })).toBe(false);
    expect(bad({ instructions: "x".repeat(501) })).toBe(false);
    expect(bad({ model: "no-slash" })).toBe(false);
    expect(bad({ format: "pcm", maxChars: 3000, instructions: "Warm and slow." })).toBe(true);
  });

  it("adds speech to the config file without breaking old ones", () => {
    expect(RoostConfigSchema.parse({}).speech).toEqual({});
    expect(RoostConfigSchema.safeParse({ speech: { narrator: { model: "openai/gpt-4o-mini-tts", voices: ["alloy", "nova"] } } }).success).toBe(true);
    expect(RoostConfigSchema.safeParse({ speech: { Narrator: { model: "openai/gpt-4o-mini-tts", voices: ["alloy"] } } }).success).toBe(false);
  });
});

describe("POST /v1/ai/speak body", () => {
  const ok = (body: object) => AiSpeakSchema.safeParse({ template: "narrator", text: "Happy birthday!", voice: "alloy", playerId: "p1", ...body }).success;

  it("takes text, a voice and optional instructions", () => {
    expect(ok({})).toBe(true);
    expect(ok({ instructions: "Cheerful." })).toBe(true);
  });

  it("rejects bad requests", () => {
    expect(ok({ template: "Narrator" })).toBe(false);
    expect(ok({ text: "" })).toBe(false);
    expect(ok({ text: "x".repeat(3001) })).toBe(false);
    expect(ok({ voice: "" })).toBe(false);
    expect(ok({ instructions: "x".repeat(301) })).toBe(false);
    expect(ok({ playerId: undefined })).toBe(false);
  });
});
