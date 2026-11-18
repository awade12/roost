import { describe, expect, it } from "vitest";
import { UpstreamError } from "../../upstream/openrouter.ts";
import { speak, speechContentType } from "../upstream.ts";

const AUDIO = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]);

function fake(response: () => Response) {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return response();
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const base = { apiKey: "k", model: "openai/gpt-4o-mini-tts", input: "Hello!", voice: "alloy", format: "mp3" as const };

describe("text-to-speech upstream", () => {
  it("sends model, input, voice and format, and returns the bytes", async () => {
    const up = fake(() => new Response(AUDIO, { headers: { "content-type": "audio/mpeg" } }));
    const result = await speak({ ...base, fetch: up.fetch });
    expect(up.calls[0]?.url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(up.calls[0]?.headers.get("authorization")).toBe("Bearer k");
    expect(up.calls[0]?.body).toEqual({ model: "openai/gpt-4o-mini-tts", input: "Hello!", voice: "alloy", response_format: "mp3" });
    expect(new Uint8Array(result.audio)).toEqual(AUDIO);
    expect(result.contentType).toBe("audio/mpeg");
  });

  it("sends instructions only when given", async () => {
    const up = fake(() => new Response(AUDIO, { headers: { "content-type": "audio/pcm" } }));
    await speak({ ...base, format: "pcm", instructions: "Whisper.", fetch: up.fetch });
    expect(up.calls[0]?.body).toMatchObject({ response_format: "pcm", instructions: "Whisper." });
  });

  it("names the content type by format", () => {
    expect(speechContentType("mp3", "application/octet-stream")).toBe("audio/mpeg");
    expect(speechContentType("pcm", "audio/pcm;rate=24000")).toBe("audio/pcm;rate=24000");
    expect(speechContentType("pcm", null)).toBe("audio/pcm");
    expect(speechContentType("pcm", "application/octet-stream")).toBe("audio/pcm");
  });

  it("turns errors, JSON and empty bodies into UpstreamError", async () => {
    const err = fake(() => new Response(JSON.stringify({ error: { code: 400, message: "bad voice" } }), { status: 400 }));
    await expect(speak({ ...base, fetch: err.fetch })).rejects.toThrow("HTTP 400");
    const json = fake(() => new Response(JSON.stringify({ error: "x" }), { headers: { "content-type": "application/json" } }));
    await expect(speak({ ...base, fetch: json.fetch })).rejects.toThrow(UpstreamError);
    const empty = fake(() => new Response(new Uint8Array(0), { headers: { "content-type": "audio/mpeg" } }));
    await expect(speak({ ...base, fetch: empty.fetch })).rejects.toThrow("no audio");
  });
});
