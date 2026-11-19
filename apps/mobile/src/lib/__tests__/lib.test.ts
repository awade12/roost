import { describe, expect, it } from "vitest";
import { apiError, ApiError, errorMessage } from "../api-error.ts";
import { parseConfig } from "../config.ts";
import { formatAgo, formatChange, formatPercent } from "../format.ts";

describe("config", () => {
  it("defaults to production and trims a trailing slash", () => {
    expect(parseConfig({ EXPO_PUBLIC_ROOST_URL: undefined }).serverUrl).toBe("https://roost.playchrona.app");
    expect(parseConfig({ EXPO_PUBLIC_ROOST_URL: "http://localhost:8787/" }).serverUrl).toBe("http://localhost:8787");
  });

  it("refuses a value that isn't a URL", () => {
    expect(() => parseConfig({ EXPO_PUBLIC_ROOST_URL: "roost.playchrona.app" })).toThrow();
  });
});

describe("api errors", () => {
  it("keeps the API's message and status", async () => {
    const res = new Response(JSON.stringify({ error: { code: "unauthorized", message: "Not signed in" } }), { status: 401 });
    const err = await apiError(res);
    expect(err).toBeInstanceOf(ApiError);
    expect([err.message, err.status]).toEqual(["Not signed in", 401]);
  });

  it("falls back when the body isn't ours", async () => {
    expect((await apiError(new Response("<html>", { status: 502 }))).message).toBe("Request failed (502)");
  });

  it("says the server is unreachable on a network failure", () => {
    expect(errorMessage(new TypeError("Network request failed"))).toMatch(/reach the Roost server/);
  });
});

describe("format", () => {
  it("formats change and percent, with a dash for no data", () => {
    expect(formatChange(0.062)).toBe("+6.2%");
    expect(formatChange(-0.031)).toBe("−3.1%");
    expect(formatChange(null)).toBe("–");
    expect(formatPercent(null)).toBe("–");
  });

  it("formats time ago compactly", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(formatAgo("2026-11-18T11:59:30Z", now)).toBe("just now");
    expect(formatAgo("2026-11-18T11:55:00Z", now)).toBe("5m ago");
    expect(formatAgo("2026-11-18T09:00:00Z", now)).toBe("3h ago");
    expect(formatAgo("2026-11-16T12:00:00Z", now)).toBe("2d ago");
  });
});
