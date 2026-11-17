import { zValidator } from "@hono/zod-validator";
import { RoostConfigSchema } from "@roost/contracts";
import { config, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import type { KeyVars } from "../../../http/client-key.ts";
import { AppError } from "../../../http/errors.ts";

const SyncQuery = z.object({ prune: z.enum(["true", "false"]).default("false"), dry_run: z.enum(["true", "false"]).default("false") });

/** Config as code: read the whole config, or apply a config file (what `roost pull` / `roost push` use). */
export function manageConfigRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .get("/manage/config", async (c) => c.json(await config.exportConfig(db, c.get("gameId"), c.get("environmentId"))))
    // Which game and environment this key belongs to (the CLI's `roost init` names the guide after it).
    .get("/manage/info", async (c) => c.json(await studio.environmentInfo(db, c.get("environmentId"))))
    .put(
      "/manage/config",
      zValidator("query", SyncQuery, (r) => {
        if (!r.success) throw new AppError("bad_request", "prune and dry_run are true or false");
      }),
      zValidator("json", RoostConfigSchema, (r) => {
        if (!r.success) throw new AppError("bad_request", `Invalid config: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`);
      }),
      async (c) => {
        const q = c.req.valid("query");
        const target = { db, gameId: c.get("gameId"), environmentId: c.get("environmentId"), prune: q.prune === "true", dryRun: q.dry_run === "true" };
        const changes = await config.applyConfig(target, c.req.valid("json"));
        const failed = changes.some((ch) => ch.result === "error");
        return c.json({ changes, applied: !target.dryRun }, failed ? 422 : 200);
      },
    );
}
