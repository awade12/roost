import { describe, expect, it } from "vitest";
import { speechCost } from "../cost.ts";

/** OpenRouter's generation endpoint: 404 until the call is recorded (`after` tries), then its cost. */
function fakeGeneration(after: number, body: unknown = { data: { total_cost: 0.0011 } }) {
  const urls: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return urls.length > after ? Response.json(body) : new Response("not yet", { status: 404 });
  }) as typeof globalThis.fetch;
  return { urls, fetch };
}

const now = async () => {};

describe("what a speech call cost", () => {
  it("reads total_cost from the generation endpoint, trying again until it's recorded", async () => {
    const g = fakeGeneration(1);
    expect(await speechCost({ apiKey: "k", generationId: "gen 1", fetch: g.fetch, sleep: now })).toBe(0.0011);
    expect(g.urls).toEqual(["https://openrouter.ai/api/v1/generation?id=gen%201", "https://openrouter.ai/api/v1/generation?id=gen%201"]);
  });

  it("gives up after its tries, or on a body without a cost", async () => {
    expect(await speechCost({ apiKey: "k", generationId: "g", fetch: fakeGeneration(9).fetch, sleep: now })).toBeUndefined();
    expect(await speechCost({ apiKey: "k", generationId: "g", fetch: fakeGeneration(0, { data: {} }).fetch, sleep: now, waits: [0] })).toBeUndefined();
  });
});
