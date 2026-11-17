import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { errorResponse } from "../http/errors.ts";
import { publicOrigin } from "./shared/origin.ts";

/** Checks a Roost key; the app passes one backed by the api_keys table. */
export type KeyCheck = (raw: string) => Promise<boolean>;

/**
 * The key from `?key=` (npm tarball URLs) or the Authorization header (Cargo sends the token as
 * is; "Bearer …" is accepted too).
 */
function keyFrom(c: Context): string {
  const auth = c.req.header("authorization") ?? "";
  return c.req.query("key") ?? c.req.header("x-roost-key") ?? auth.replace(/^Bearer\s+/i, "");
}

const VERSIONED_TGZ = /^roost-sdk-\d+\.\d+\.\d+\.tgz$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Hosts the SDKs built by `pnpm build:sdks`, so games install from this server: an npm tarball,
 * and a Cargo sparse registry (https://doc.rust-lang.org/cargo/reference/registry-index.html).
 * Downloads need any valid Roost key (a client key is fine). Only the info page and Cargo's
 * config.json are open: they hold no code, and Cargo reads config.json to learn it must log in.
 */
export function sdkRoutes(sdkDir: string, checkKey: KeyCheck) {
  const read = (path: string) => readFile(join(sdkDir, path)).catch(() => null);
  const missing = (c: Context) => errorResponse(c, "not_found", "SDK not found here. The server runs `pnpm build:sdks` to publish SDKs.");
  const latest = async () => JSON.parse((await read("js/latest.json"))?.toString() ?? "null") as { version: string; file: string } | null;

  const needKey: MiddlewareHandler = async (c, next) => {
    if (!(await checkKey(keyFrom(c)))) {
      return errorResponse(c, "unauthorized", "SDK downloads need a Roost key: add ?key=rk_client_… to the npm URL, or `cargo login --registry roost`.");
    }
    await next();
  };

  return new Hono()
    .use("/js/*", needKey)
    .use("/cargo/ro/*", needKey)
    .use("/cargo/crates/*", needKey)
    .get("/", async (c) => {
      const js = await latest();
      const index = (await read("cargo/index/ro/os/roost-sdk"))?.toString().trim().split("\n").at(-1);
      const rust = index ? (JSON.parse(index) as { vers: string }).vers : null;
      const base = publicOrigin(c);
      return c.json({
        js: js && { version: js.version, install: `npm install "${base}/sdk/js/latest.tgz?key=<client key>"` },
        rust: rust && {
          version: rust,
          cargoConfig: `[registries.roost]\nindex = "sparse+${base}/sdk/cargo/"\ncredential-provider = ["cargo:token"]`,
          login: "cargo login --registry roost <client key>   (CI: CARGO_REGISTRIES_ROOST_TOKEN)",
          dependency: `roost-sdk = { version = "${rust}", registry = "roost" }`,
        },
      });
    })
    // Always the newest build; npm records the versioned URL it redirects to in the lockfile.
    .get("/js/latest.tgz", async (c) => {
      const js = await latest();
      const key = c.req.query("key");
      return js ? c.redirect(`/sdk/js/${js.file}${key ? `?key=${encodeURIComponent(key)}` : ""}`, 302) : missing(c);
    })
    .get("/js/:file", async (c) => {
      const file = c.req.param("file");
      const body = VERSIONED_TGZ.test(file) ? await read(`js/${file}`) : null;
      return body ? c.body(new Uint8Array(body), 200, { "content-type": "application/gzip", "cache-control": "public, max-age=31536000, immutable" }) : missing(c);
    })
    .get("/cargo/config.json", (c) => c.json({ dl: `${publicOrigin(c)}/sdk/cargo/crates`, "auth-required": true }))
    .get("/cargo/ro/os/roost-sdk", async (c) => {
      const body = await read("cargo/index/ro/os/roost-sdk");
      return body ? c.text(body.toString(), 200, { "cache-control": "no-cache" }) : missing(c);
    })
    .get("/cargo/crates/roost-sdk/:version/download", async (c) => {
      const version = c.req.param("version");
      const body = SEMVER.test(version) ? await read(`cargo/crates/roost-sdk/${version}.crate`) : null;
      return body ? c.body(new Uint8Array(body), 200, { "content-type": "application/x-tar", "cache-control": "public, max-age=31536000, immutable" }) : missing(c);
    });
}
