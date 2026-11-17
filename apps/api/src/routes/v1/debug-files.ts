import { zValidator } from "@hono/zod-validator";
import { symbolication } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../app.ts";
import { limitBody } from "../../http/body-limit.ts";
import { requireKey, requireServerKey, type KeyVars } from "../../http/client-key.ts";
import { AppError } from "../../http/errors.ts";

/** Symbol files for big games run to hundreds of MB; past this, split or strip them. */
const MAX_DEBUG_FILE = 200 * 1024 * 1024;
const MapQuery = z.object({ build: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(256) });

/** Breakpad .sym files (from dump_syms) and JS source maps, per game. */
export function debugFileRoutes({ db, storage }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .put("/debug-files/breakpad", limitBody(MAX_DEBUG_FILE), requireKey(db),
      requireServerKey(), async (c) => {
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const header = symbolication.breakpadHeader(new TextDecoder().decode(bytes.slice(0, 1024)));
      if (!header) throw new AppError("bad_request", "Not a Breakpad .sym file (first line must be MODULE <os> <arch> <id> <name>)");
      const file = await symbolication.saveDebugFile(db, storage, { gameId: c.get("gameId"), kind: "breakpad", ...header, bytes, contentType: "text/plain" });
      return c.json(file, 201);
    })
    .put(
      "/debug-files/sourcemaps",
      limitBody(MAX_DEBUG_FILE),
      requireKey(db),
      requireServerKey(),
      zValidator("query", MapQuery, (result) => {
        if (!result.success) throw new AppError("bad_request", "?build= and ?name= (the bundle file name) are required");
      }),
      async (c) => {
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        try {
          const map = JSON.parse(new TextDecoder().decode(bytes)) as { mappings?: unknown };
          if (typeof map.mappings !== "string") throw new Error("no mappings");
        } catch {
          throw new AppError("bad_request", "Not a source map (JSON with a mappings field)");
        }
        const { build, name } = c.req.valid("query");
        const file = await symbolication.saveDebugFile(db, storage, { gameId: c.get("gameId"), kind: "sourcemap", name, build, bytes, contentType: "application/json" });
        return c.json(file, 201);
      },
    );
}
