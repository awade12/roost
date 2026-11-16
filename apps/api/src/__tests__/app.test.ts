import type { Clickhouse } from "@roost/clickhouse";
import type { Db } from "@roost/db";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { testAuthDeps, testExtras } from "./helpers.ts";

// These routes never touch the database, so a stub is enough.
// Routes that do (e.g. /v1/events) get integration tests against real Postgres.
const app = createApp({ db: {} as Db, ch: {} as Clickhouse, auth: testAuthDeps(), ai: { apiKey: undefined }, ...testExtras() });

describe("app", () => {
  it("answers /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "No such route" } });
  });

  it("rejects /v1/events without a key", async () => {
    const res = await app.request("/v1/events", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});
