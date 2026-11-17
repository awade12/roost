import { afterEach, describe, expect, it, vi } from "vitest";
import { Roost } from "../client.ts";
import { uuid } from "../ids/index.ts";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uuid", () => {
  it("makes v4 UUIDs with only getRandomValues (Hermes with a polyfill)", () => {
    const getRandomValues = (b: Uint8Array) => {
      for (let i = 0; i < b.length; i += 1) b[i] = (i * 37) % 256;
      return b;
    };
    vi.stubGlobal("crypto", { getRandomValues });
    expect(uuid()).toMatch(V4);
  });

  it("makes distinct v4 UUIDs with no crypto at all (bare Hermes)", () => {
    vi.stubGlobal("crypto", undefined);
    const ids = new Set(Array.from({ length: 200 }, () => uuid()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  // Regression: the client called crypto.randomUUID() when constructed, so on Hermes
  // `new Roost()` threw and the game never sent anything.
  it("starts and sends events on an engine without crypto.randomUUID", async () => {
    vi.stubGlobal("crypto", undefined);
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 202 }));
    const roost = new Roost({ endpoint: "https://roost.test", clientKey: "ck_test", playerId: "p1", context: { build: "1", platform: "ios" }, fetch, flushIntervalMs: 60_000 });
    roost.track("level_start");
    await roost.flush();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { events: { id: string }[] };
    expect(body.events.length).toBeGreaterThan(0);
    for (const e of body.events) expect(e.id).toMatch(V4);
  });
});
