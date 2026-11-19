import { randomUUID } from "node:crypto";
import type { Clickhouse } from "@roost/clickhouse";
import { createDb, users } from "@roost/db";
import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { memoryMailer, testAuthDeps, testExtras } from "./helpers.ts";

// Needs Postgres with migrations applied. Skips if DATABASE_URL is not available.
try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env: rely on the real environment.
}
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("dashboard sign-in (integration)", () => {
  const { db, pool } = createDb(databaseUrl ?? "postgres://unused");
  const run = randomUUID().slice(0, 8);
  const mailer = memoryMailer();
  // ClickHouse is not used by /admin routes.
  const app = createApp({ db, ch: {} as Clickhouse, auth: testAuthDeps(mailer), ai: { apiKey: undefined }, ...testExtras() });

  // Each test uses its own address so the per-email rate limit never interferes.
  const newEmail = () => `${randomUUID().slice(0, 6)}-${run}@test.roost`;
  const post = (path: string, body: unknown, cookie?: string) =>
    app.request(`/admin/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  const me = (cookie?: string) => app.request("/admin/me", cookie ? { headers: { cookie } } : {});
  const cookieFrom = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

  afterAll(async () => {
    await db.delete(users).where(like(users.email, `%-${run}@test.roost`));
    await pool.end();
  });

  it("signs up, reads /me, and signs out", async () => {
    const email = newEmail();
    expect((await post("/otp/start", { email: email.toUpperCase() })).status).toBe(200);
    const code = mailer.lastCode();
    expect(mailer.sent.at(-1)?.to).toBe(email);

    const verified = await post("/otp/verify", { email, code });
    expect(verified.status).toBe(200);
    const cookie = cookieFrom(verified);
    expect(verified.headers.get("set-cookie")).toMatch(/HttpOnly/i);

    const meRes = await me(cookie);
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toMatchObject({ email, orgs: [] });

    expect((await post("/logout", {}, cookie)).status).toBe(200);
    expect((await me(cookie)).status).toBe(401);
  });

  it("gives the mobile app a bearer token instead of a cookie", async () => {
    const email = newEmail();
    await post("/otp/start", { email });
    const verified = await post("/otp/verify", { email, code: mailer.lastCode(), client: "app" });
    expect(verified.status).toBe(200);
    expect(verified.headers.get("set-cookie")).toBeNull();
    const { token, expiresAt } = (await verified.json()) as { token: string; expiresAt: string };
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const bearer = { authorization: `Bearer ${token}` };
    expect((await app.request("/admin/me", { headers: bearer })).status).toBe(200);
    // Regression: like the app, no body and no Origin. csrf() used to refuse this, so the session stayed live.
    const out = await app.request("/admin/auth/logout", { method: "POST", headers: bearer });
    expect(out.status).toBe(200);
    expect((await app.request("/admin/me", { headers: bearer })).status).toBe(401);
    expect((await app.request("/admin/me", { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("still refuses a cross-site form post that carries the cookie", async () => {
    const res = await app.request("/admin/auth/logout", {
      method: "POST",
      headers: { cookie: "roost_session=x", origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
      body: "a=1",
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  it("uses a code only once", async () => {
    const email = newEmail();
    await post("/otp/start", { email });
    const code = mailer.lastCode();
    expect((await post("/otp/verify", { email, code })).status).toBe(200);
    expect((await post("/otp/verify", { email, code })).status).toBe(400);
  });

  it("kills a code after 5 wrong tries", async () => {
    const email = newEmail();
    await post("/otp/start", { email });
    const code = mailer.lastCode() ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) await post("/otp/verify", { email, code: wrong });
    expect((await post("/otp/verify", { email, code })).status).toBe(400);
  });

  it("only the newest code works", async () => {
    const email = newEmail();
    await post("/otp/start", { email });
    const first = mailer.lastCode();
    await post("/otp/start", { email });
    const second = mailer.lastCode();
    if (first !== second) expect((await post("/otp/verify", { email, code: first })).status).toBe(400);
    expect((await post("/otp/verify", { email, code: second })).status).toBe(200);
  });

  it("answers the same for emails not allowed to sign up, but sends nothing", async () => {
    const before = mailer.sent.length;
    expect((await post("/otp/start", { email: `x-${run}@elsewhere.example` })).status).toBe(200);
    expect(mailer.sent.length).toBe(before);
  });

  it("rate-limits code requests per email", async () => {
    const email = newEmail();
    for (let i = 0; i < 3; i += 1) await post("/otp/start", { email });
    const res = await post("/otp/start", { email });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("rejects /me without a cookie or with a forged one", async () => {
    expect((await me()).status).toBe(401);
    expect((await me("roost_session=forged")).status).toBe(401);
  });
});
