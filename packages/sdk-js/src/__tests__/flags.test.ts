import { describe, expect, it, vi } from "vitest";
import { Roost } from "../client.ts";

const CONFIG = {
  version: "v1",
  flags: {
    new_shop: { type: "boolean", value: true, variant: "rollout", reason: "SPLIT" },
    "enemy.tuning": { type: "json", value: { hp: 120 }, variant: "default", reason: "STATIC" },
    greeting: { type: "string", value: "Hi", variant: "default", reason: "STATIC" },
  },
};

function makeClient() {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const etag = (init?.headers as Record<string, string> | undefined)?.["if-none-match"];
    return etag === '"v1"' ? new Response(null, { status: 304 }) : new Response(JSON.stringify(CONFIG), { status: 200 });
  });
  const roost = new Roost({ endpoint: "https://roost.test", clientKey: "k", playerId: "p 1", context: { build: "1", platform: "web" }, fetch, storage, flushIntervalMs: 60_000 });
  return { roost, fetch, store };
}

describe("flags", () => {
  it("serves defaults before the first fetch, then the player's values", async () => {
    const { roost, fetch } = makeClient();
    expect(roost.flags.getBoolean("new_shop", false)).toBe(false);
    expect(await roost.flags.refresh()).toBe(true);
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://roost.test/v1/config?playerId=p%201");
    expect(roost.flags.getBoolean("new_shop", false)).toBe(true);
    expect(roost.flags.getObject("enemy.tuning", { hp: 100 })).toEqual({ hp: 120 });
    expect(roost.flags.getNumber("greeting", 7)).toBe(7);
  });

  it("revalidates with the version and keeps values across launches", async () => {
    const { roost, store } = makeClient();
    await roost.flags.refresh();
    expect(await roost.flags.refresh()).toBe(false);
    const next = new Roost({ endpoint: "https://roost.test", clientKey: "k", playerId: "p", context: { build: "1", platform: "web" }, fetch: () => Promise.reject(new Error("offline")), storage: { getItem: (k) => store.get(k) ?? null, setItem: () => undefined } });
    await next.flags.load();
    expect(next.flags.getString("greeting", "")).toBe("Hi");
  });

  it("acts as an OpenFeature provider with reasons and error codes", async () => {
    const { roost } = makeClient();
    await roost.flags.refresh();
    const provider = roost.openFeatureProvider();
    expect(provider.resolveBooleanEvaluation("new_shop", false)).toEqual({ value: true, variant: "rollout", reason: "SPLIT" });
    expect(provider.resolveStringEvaluation("missing", "x")).toEqual({ value: "x", reason: "ERROR", errorCode: "FLAG_NOT_FOUND" });
    expect(provider.resolveNumberEvaluation("new_shop", 1)).toMatchObject({ value: 1, errorCode: "TYPE_MISMATCH" });
  });
});
