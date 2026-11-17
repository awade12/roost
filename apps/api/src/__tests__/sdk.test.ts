import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { sdkRoutes } from "../routes/sdk.ts";

/** A dist/sdk folder like `pnpm build:sdks` writes. */
function fakeSdkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "roost-sdk-"));
  mkdirSync(join(dir, "js"));
  writeFileSync(join(dir, "js/latest.json"), JSON.stringify({ version: "0.3.0", file: "roost-sdk-0.3.0.tgz" }));
  writeFileSync(join(dir, "js/roost-sdk-0.3.0.tgz"), "tarball");
  mkdirSync(join(dir, "cargo/index/ro/os"), { recursive: true });
  writeFileSync(join(dir, "cargo/index/ro/os/roost-sdk"), `${JSON.stringify({ name: "roost-sdk", vers: "0.2.0" })}\n`);
  mkdirSync(join(dir, "cargo/crates/roost-sdk"), { recursive: true });
  writeFileSync(join(dir, "cargo/crates/roost-sdk/0.2.0.crate"), "crate");
  return dir;
}

// Real key checks are covered against Postgres in manage.integration.test.ts.
const app = new Hono().route("/sdk", sdkRoutes(fakeSdkDir(), async (raw) => raw === "rk_client_good"));
const get = (path: string, headers: Record<string, string> = {}) => app.request(`http://roost.test${path}`, { headers });
const KEY = "key=rk_client_good";

describe("SDK hosting", () => {
  it("lists install lines using the public origin", async () => {
    const res = await get("/sdk", { "x-forwarded-proto": "https", host: "roost.example.com" });
    const body = (await res.json()) as { js: { install: string }; rust: { cargoConfig: string; dependency: string } };
    expect(body.js.install).toBe('npm install "https://roost.example.com/sdk/js/latest.tgz?key=<client key>"');
    expect(body.rust.cargoConfig).toContain('index = "sparse+https://roost.example.com/sdk/cargo/"');
    expect(body.rust.dependency).toBe('roost-sdk = { version = "0.2.0", registry = "roost" }');
  });

  it("serves the npm tarball to a valid key, newest through latest.tgz", async () => {
    expect((await get("/sdk/js/latest.tgz")).status).toBe(401);
    expect((await get("/sdk/js/roost-sdk-0.3.0.tgz?key=rk_client_bad")).status).toBe(401);
    const latest = await get(`/sdk/js/latest.tgz?${KEY}`);
    expect(latest.status).toBe(302);
    expect(latest.headers.get("location")).toBe(`/sdk/js/roost-sdk-0.3.0.tgz?${KEY}`);
    expect(await (await get(`/sdk/js/roost-sdk-0.3.0.tgz?${KEY}`)).text()).toBe("tarball");
    expect((await get(`/sdk/js/package.json?${KEY}`)).status).toBe(404);
  });

  it("is a Cargo sparse registry that needs a login", async () => {
    expect(await (await get("/sdk/cargo/config.json", { host: "roost.example.com" })).json()).toEqual({ dl: "http://roost.example.com/sdk/cargo/crates", "auth-required": true });
    expect((await get("/sdk/cargo/ro/os/roost-sdk")).status).toBe(401);
    // Cargo sends the token as is; Bearer works too.
    const auth = { authorization: "rk_client_good" };
    expect(await (await get("/sdk/cargo/ro/os/roost-sdk", auth)).text()).toContain('"vers":"0.2.0"');
    expect(await (await get("/sdk/cargo/crates/roost-sdk/0.2.0/download", { authorization: "Bearer rk_client_good" })).text()).toBe("crate");
    expect((await get("/sdk/cargo/crates/roost-sdk/0.2.0/download")).status).toBe(401);
    expect((await get("/sdk/cargo/crates/roost-sdk/..%2F..%2Fx/download", auth)).status).toBe(404);
  });
});
