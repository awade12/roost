import { describe, expect, it, vi } from "vitest";
import { Roost } from "../client.ts";

function makeClient(status = 202) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status }));
  const roost = new Roost({
    endpoint: "https://roost.test",
    clientKey: "ck_test",
    playerId: "p1",
    context: { build: "1.0.0", platform: "ios" },
    fetch,
    flushIntervalMs: 60_000,
    getAttachments: () => [{ name: "save.json", data: '{"gold":3}' }],
  });
  return { roost, fetch };
}

const call = (fetch: ReturnType<typeof makeClient>["fetch"], i: number) => fetch.mock.calls[i] as unknown as [string, RequestInit];

describe("player reports", () => {
  it("sends the report with scope, then the screenshot and save", async () => {
    const { roost, fetch } = makeClient();
    roost.setTag("level", "forest-3");
    roost.addBreadcrumb({ name: "opened_menu" });
    const result = await roost.report({
      message: "Can't jump",
      email: "a@b.com",
      attachments: [{ name: "screenshot.png", data: new Uint8Array([1, 2]), contentType: "image/png" }],
    });
    expect(result.ok).toBe(true);
    const [url, init] = call(fetch, 0);
    expect(url).toBe("https://roost.test/v1/reports");
    const body = JSON.parse(String(init.body)) as { report: { category: string; tags: Record<string, string>; breadcrumbs: unknown[]; attachments: { name: string }[] } };
    expect(body.report.category).toBe("bug");
    expect(body.report.tags.level).toBe("forest-3");
    expect(body.report.breadcrumbs).toHaveLength(1);
    expect(body.report.attachments.map((a) => a.name)).toEqual(["screenshot.png", "save.json"]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(call(fetch, 1)[0]).toMatch(/\/v1\/reports\/[\w-]+\/attachments\/[\w-]+$/);
  });

  it("can leave out getAttachments files", async () => {
    const { roost, fetch } = makeClient();
    await roost.report({ message: "Typo in shop", category: "feedback", includeAttachments: false });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns an error instead of throwing", async () => {
    const { roost } = makeClient(500);
    expect(await roost.report({ message: "x" })).toEqual({ ok: false, error: "HTTP 500" });
    const offline = new Roost({
      endpoint: "https://roost.test",
      clientKey: "k",
      playerId: "p",
      context: { build: "1", platform: "web" },
      fetch: () => Promise.reject(new Error("offline")),
    });
    expect(await offline.report({ message: "x" })).toEqual({ ok: false, error: "offline" });
  });
});
