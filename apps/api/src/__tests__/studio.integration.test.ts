import { randomUUID } from "node:crypto";
import type { Clickhouse } from "@roost/clickhouse";
import { createDb, memberships, orgs, users } from "@roost/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { memoryMailer, signIn, testAuthDeps, testExtras } from "./helpers.ts";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const databaseUrl = process.env.DATABASE_URL;

type Game = { id: string; environments: { id: string; name: string; keys: { id: string }[] }[] };

describe.skipIf(!databaseUrl)("orgs, games and keys (integration)", () => {
  const { db, pool } = createDb(databaseUrl ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  // Only /v1/events touches ClickHouse, and these tests stop before ingest.
  const app = createApp({ db, ch: {} as Clickhouse, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
  const call = (cookie: string, method: string, path: string, body?: unknown) =>
    app.request(`/admin${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  let owner = "";
  let outsider = "";
  let orgId = "";

  beforeAll(async () => {
    owner = await signIn(app, mailer, `owner-${run}@test.roost`);
    outsider = await signIn(app, mailer, `outsider-${run}@test.roost`);
    const res = await call(owner, "POST", "/orgs", { name: "Hollow Pine" });
    expect(res.status).toBe(201);
    orgId = ((await res.json()) as { id: string }).id;
  });

  afterAll(async () => {
    if (orgId) await db.delete(orgs).where(eq(orgs.id, orgId));
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("lists the new org on /me with the owner role", async () => {
    const me = (await (await call(owner, "GET", "/me")).json()) as { orgs: { id: string; role: string }[] };
    expect(me.orgs).toContainEqual(expect.objectContaining({ id: orgId, role: "owner" }));
  });

  it("creates a game with production and development environments", async () => {
    expect((await call(owner, "POST", `/orgs/${orgId}/games`, { name: "Sky Forge" })).status).toBe(201);
    expect((await call(owner, "POST", `/orgs/${orgId}/games`, { name: "sky forge" })).status).toBe(409);
    const { games } = (await (await call(owner, "GET", `/orgs/${orgId}/games`)).json()) as { games: Game[] };
    expect(games[0]?.environments.map((e) => e.name)).toEqual(["development", "production"]);
  });

  it("creates a key that works on /v1 once, and stops working when revoked", async () => {
    const { games } = (await (await call(owner, "GET", `/orgs/${orgId}/games`)).json()) as { games: Game[] };
    const envId = games[0]?.environments[0]?.id;
    const created = await call(owner, "POST", `/environments/${envId}/keys`, { kind: "client" });
    expect(created.status).toBe(201);
    const key = (await created.json()) as { id: string; raw: string; prefix: string };
    expect(key.raw.startsWith(key.prefix)).toBe(true);

    // A valid key gets past auth: an empty batch fails validation (400), not auth (401).
    const ingest = () =>
      app.request("/v1/events", {
        method: "POST",
        headers: { "content-type": "application/json", "x-roost-key": key.raw },
        body: "{}",
      });
    expect((await ingest()).status).toBe(400);

    expect((await call(owner, "DELETE", `/keys/${key.id}`)).status).toBe(200);
    expect((await ingest()).status).toBe(401);
  });

  it("hides the org from non-members", async () => {
    expect((await call(outsider, "GET", `/orgs/${orgId}/games`)).status).toBe(404);
    expect((await call(outsider, "POST", `/orgs/${orgId}/games`, { name: "Sneaky" })).status).toBe(404);
  });

  it("lets a viewer read but not create games or keys", async () => {
    const [outsiderUser] = await db.select().from(users).where(eq(users.email, `outsider-${run}@test.roost`));
    await db.insert(memberships).values({ orgId, userId: outsiderUser?.id ?? "", role: "viewer" });
    expect((await call(outsider, "GET", `/orgs/${orgId}/games`)).status).toBe(200);
    expect((await call(outsider, "POST", `/orgs/${orgId}/games`, { name: "Nope" })).status).toBe(403);
    const { games } = (await (await call(outsider, "GET", `/orgs/${orgId}/games`)).json()) as { games: Game[] };
    const envId = games[0]?.environments[0]?.id;
    expect((await call(outsider, "POST", `/environments/${envId}/keys`, { kind: "client" })).status).toBe(403);
  });

  it("rejects requests without a session", async () => {
    expect((await call("", "GET", `/orgs/${orgId}/games`)).status).toBe(401);
  });
});
