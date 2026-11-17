import { describe, expect, it, vi } from "vitest";
import { RoostAiError } from "../ai/index.ts";
import { Roost } from "../client.ts";

function makeClient(status: number) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status }));
  const roost = new Roost({
    endpoint: "https://roost.test",
    clientKey: "ck_test",
    playerId: "p1",
    context: { build: "1.0.0", platform: "ios" },
    fetch,
    flushIntervalMs: 60_000,
  });
  return { roost, fetch };
}

describe("Roost client", () => {
  it("sends queued events with the key header", async () => {
    const { roost, fetch } = makeClient(202);
    roost.track("level_start", { level: 1 });
    await roost.flush();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://roost.test/v1/events");
    expect((init.headers as Record<string, string>)["x-roost-key"]).toBe("ck_test");
  });

  it("keeps events queued when the server is down", async () => {
    const { roost, fetch } = makeClient(503);
    roost.track("level_start");
    await roost.flush();
    await roost.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("drops a batch the server rejects as invalid", async () => {
    const { roost, fetch } = makeClient(400);
    roost.track("level_start");
    await roost.flush();
    await roost.flush();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("runs an AI template and surfaces API errors with their code", async () => {
    const ok = makeClient(200);
    ok.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ text: "hi", model: "m", usage: { tokensIn: 1, tokensOut: 1 } })));
    expect((await ok.roost.ai("coach_chat", { q: "hey" })).text).toBe("hi");

    const limited = makeClient(429);
    limited.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "rate_limited", message: "Slow down" } }), { status: 429 }),
    );
    const error = await limited.roost.ai("coach_chat").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RoostAiError);
    expect(error).toMatchObject({ code: "rate_limited", message: "Slow down" });
  });
});

describe("crash reporting", () => {
  it("sends a captured error with recent events as breadcrumbs", async () => {
    const { roost, fetch } = makeClient(202);
    roost.track("shop_open");
    await roost.captureError(new TypeError("boom"));
    const crashCall = fetch.mock.calls.find((c) => String(c[0]).endsWith("/v1/crashes")) as unknown as [string, RequestInit];
    const body = JSON.parse(String(crashCall[1].body)) as { crashes: { type: string; kind: string; breadcrumbs: { name: string }[] }[] };
    expect(body.crashes[0]).toMatchObject({ type: "TypeError", kind: "error", breadcrumbs: [{ name: "shop_open", category: "event" }] });
  });

  it("keeps a fatal crash in storage and sends it on the next start", async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const offline = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 202 }));
    const first = new Roost({ endpoint: "https://roost.test", clientKey: "ck", playerId: "p1", context: { build: "1", platform: "ios" }, storage, fetch: offline, captureCrashes: false });
    await first.captureError(new Error("fatal"), { fatal: true });
    expect(offline).not.toHaveBeenCalled(); // fatal: saved, not sent while dying
    expect(store.get("roost:crashes")).toContain("fatal");

    const next = new Roost({ endpoint: "https://roost.test", clientKey: "ck", playerId: "p1", context: { build: "1", platform: "ios" }, storage, fetch: offline, captureCrashes: false });
    await next.start();
    await next.stop();
    expect(offline.mock.calls.some((c) => String(c[0]).endsWith("/v1/crashes"))).toBe(true);
  });

  it("sends tags, contexts, extra, fingerprint and a save file, under the developer's control", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 202 }));
    const roost = new Roost({
      endpoint: "https://roost.test",
      clientKey: "ck",
      playerId: "p1",
      context: { build: "1", platform: "ios" },
      fetch,
      captureCrashes: false,
      getAttachments: () => [{ name: "save.json", data: '{"gold":5}', contentType: "application/json" }],
      beforeSend: (r) => ({ ...r, extra: { ...r.extra, scrubbed: true } }),
    });
    roost.setTag("mode", "ranked");
    roost.setContext("match", { round: 3 });
    roost.addBreadcrumb({ name: "save_written", category: "save", level: "info", message: "slot 2" });
    await roost.captureError(new Error("corrupt"), { fingerprint: ["save-corrupt"], tags: { slot: "2" } });

    const post = fetch.mock.calls.find((c) => String(c[0]).endsWith("/v1/crashes"));
    const report = (JSON.parse(String(post?.[1]?.body)) as { crashes: Record<string, unknown>[] }).crashes[0];
    expect(report).toMatchObject({
      tags: { mode: "ranked", slot: "2" },
      contexts: { match: { round: 3 } },
      extra: { scrubbed: true },
      fingerprint: ["save-corrupt"],
      breadcrumbs: [{ name: "save_written", category: "save", message: "slot 2" }],
      attachments: [{ name: "save.json", contentType: "application/json", size: 10 }],
    });
    const upload = fetch.mock.calls.find((c) => String(c[0]).includes("/attachments/"));
    expect(upload?.[1]?.method).toBe("PUT");
    expect(new TextDecoder().decode(upload?.[1]?.body as Uint8Array)).toBe('{"gold":5}');
  });

  it("drops a report when beforeSend returns null", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 202 }));
    const roost = new Roost({ endpoint: "https://roost.test", clientKey: "ck", playerId: "p1", context: { build: "1", platform: "ios" }, fetch, captureCrashes: false, beforeSend: () => null });
    await roost.captureMessage("noisy");
    expect(fetch).not.toHaveBeenCalled();
  });
});
