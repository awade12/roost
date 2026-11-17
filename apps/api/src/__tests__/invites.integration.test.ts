import { randomUUID } from "node:crypto";
import { createClickhouse, type Clickhouse } from "@roost/clickhouse";
import { createDb, orgs, users } from "@roost/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { memoryMailer, setupStudio, signIn, testAuthDeps, testExtras } from "./helpers.ts";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const ready = Boolean(process.env.DATABASE_URL && process.env.CLICKHOUSE_URL);

describe.skipIf(!ready)("studio invites (integration)", () => {
  const env = ready ? loadEnv() : undefined;
  const { db, pool } = createDb(env?.DATABASE_URL ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  // Only @test.roost may sign up, so the invited address (elsewhere) proves invites open the door.
  const friend = `friend-${run}@elsewhere.test`;
  let ch: Clickhouse;
  let app: ReturnType<typeof createApp>;
  let owner = "";
  let studio = { orgId: "", gameId: "", envId: "", key: "" };

  const call = (method: string, path: string, cookie: string, body?: unknown) =>
    app.request(`/admin${path}`, { method, headers: { cookie, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const lastLinkToken = () => /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1] ?? "";

  beforeAll(async () => {
    if (!env) return;
    ch = createClickhouse(env);
    app = createApp({ db, ch, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });
    owner = await signIn(app, mailer, `owner-${run}@test.roost`);
    studio = await setupStudio(app, owner, `Invites ${run}`);
  });

  afterAll(async () => {
    if (studio.orgId) await db.delete(orgs).where(eq(orgs.id, studio.orgId));
    await db.delete(users).where(like(users.email, `%-${run}@%`));
    await pool.end();
    await ch?.close();
  });

  it("can't sign up an outsider without an invite", async () => {
    await expect(signIn(app, mailer, `nobody-${run}@elsewhere.test`)).rejects.toThrow();
  });

  it("emails an invite link that lets the invited person sign up and join", async () => {
    const res = await call("POST", `/orgs/${studio.orgId}/invites`, owner, { email: friend.toUpperCase(), role: "dev" });
    expect(res.status).toBe(201);
    expect(mailer.sent.at(-1)?.to).toBe(friend);
    expect(mailer.sent.at(-1)?.subject).toBe(`You're invited to Test org on Roost`);
    const token = lastLinkToken();
    expect(token.length).toBeGreaterThan(16);
    const listed = (await (await call("GET", `/orgs/${studio.orgId}/invites`, owner)).json()) as { invites: { email: string }[] };
    expect(listed.invites.map((i) => i.email)).toEqual([friend]);

    const cookie = await signIn(app, mailer, friend);
    expect(await (await call("GET", `/invites/${token}`, cookie)).json()).toEqual({ orgName: "Test org", email: friend, role: "dev" });
    expect((await call("POST", `/invites/${token}/accept`, cookie)).status).toBe(200);
    const members = (await (await call("GET", `/orgs/${studio.orgId}/members`, owner)).json()) as { members: { email: string; role: string }[] };
    expect(members.members).toContainEqual(expect.objectContaining({ email: friend, role: "dev" }));
    expect((await call("POST", `/invites/${token}/accept`, cookie)).status).toBe(404);
    expect((await call("POST", `/orgs/${studio.orgId}/invites`, owner, { email: friend, role: "viewer" })).status).toBe(409);
  });

  it("only works for the invited email, and owners can revoke", async () => {
    const res = await call("POST", `/orgs/${studio.orgId}/invites`, owner, { email: `other-${run}@test.roost`, role: "viewer" });
    const { id } = (await res.json()) as { id: string };
    const token = lastLinkToken();
    const someoneElse = await signIn(app, mailer, `someone-${run}@test.roost`);
    expect((await call("POST", `/invites/${token}/accept`, someoneElse)).status).toBe(403);
    expect((await call("POST", `/orgs/${studio.orgId}/invites`, someoneElse, { email: "x@test.roost", role: "owner" })).status).toBe(404);
    expect((await call("DELETE", `/orgs/${studio.orgId}/invites/${id}`, owner)).status).toBe(200);
    expect((await call("GET", `/invites/${token}`, someoneElse)).status).toBe(404);
  });
});
