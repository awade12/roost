import { zValidator } from "@hono/zod-validator";
import { config } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../app.ts";
import { requireKey, type KeyVars } from "../../http/client-key.ts";
import { AppError } from "../../http/errors.ts";

const Query = z.object({ playerId: z.string().min(1).max(64) });

/**
 * Remote config and flags, resolved for one player. Games poll this; with If-None-Match the
 * answer is a body-less 304 until something changes. The version covers every flag, not this
 * player's values, so it's safe as a shared ETag.
 */
export function configRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>().get(
    "/config",
    requireKey(db),
    zValidator("query", Query, (result) => {
      if (!result.success) throw new AppError("bad_request", "?playerId= is required");
    }),
    async (c) => {
      const { flags, version } = await config.configFor(db, c.get("environmentId"), c.req.valid("query").playerId);
      const etag = `"${version}"`;
      c.header("ETag", etag);
      c.header("Cache-Control", "private, no-cache");
      if (c.req.header("if-none-match") === etag) return c.body(null, 304);
      return c.json({ flags, version });
    },
  );
}
