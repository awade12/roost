import { zValidator } from "@hono/zod-validator";
import { studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { invalid, requireOrgRole } from "../access.ts";

const EnvParam = z.object({ environmentId: z.uuid() });
const KeyParam = z.object({ keyId: z.uuid() });
const CreateKey = z.object({ kind: z.enum(["client", "server"]) });

export function keyRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .post(
      "/environments/:environmentId/keys",
      zValidator("param", EnvParam, invalid),
      zValidator("json", CreateKey, invalid),
      async (c) => {
        const { environmentId } = c.req.valid("param");
        const { kind } = c.req.valid("json");
        const orgId = await studio.orgOfEnvironment(db, environmentId);
        // Server keys can read all of a game's data, so only owners may mint them.
        await requireOrgRole(db, c.get("userId"), orgId, kind === "server" ? "owner" : "dev");
        return c.json(await studio.createKey(db, environmentId, kind), 201);
      },
    )
    .delete("/keys/:keyId", zValidator("param", KeyParam, invalid), async (c) => {
      const { keyId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), await studio.orgOfKey(db, keyId), "dev");
      if (!(await studio.revokeKey(db, keyId))) throw new AppError("not_found", "Key already revoked");
      return c.json({ ok: true as const });
    });
}
