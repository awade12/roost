import { zValidator } from "@hono/zod-validator";
import { FlagBodySchema, FlagFieldsSchema, FlagKeySchema, type FlagType } from "@roost/contracts";
import { config, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const EnvParam = z.object({ environmentId: z.uuid() });
const FlagParam = z.object({ flagId: z.uuid() });
const Fields = FlagFieldsSchema;
const NewFlag = FlagBodySchema.extend({ key: FlagKeySchema });

/** Every value a flag can serve must fit its type, or games reading it would get garbage. */
function checkTypes(type: FlagType, f: z.infer<typeof Fields>) {
  if (!config.flagValuesMatch(type, f)) throw new AppError("bad_request", `Every value must be a ${type}`);
}

/** Flags per environment. Devs edit them; viewers can look. */
export function configAdminRoutes({ db }: AppDeps) {
  const forFlag = async (userId: string, flagId: string) => {
    const found = await config.flagById(db, flagId);
    await requireOrgRole(db, userId, found?.orgId ?? null, "dev");
    if (!found) throw new AppError("not_found", "Not found");
    return found.flag;
  };
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/environments/:environmentId/flags", zValidator("param", EnvParam, invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), await studio.orgOfEnvironment(db, environmentId), "viewer");
      return c.json({ flags: await config.listFlags(db, environmentId) });
    })
    .post("/environments/:environmentId/flags", zValidator("param", EnvParam, invalid), zValidator("json", NewFlag, invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), await studio.orgOfEnvironment(db, environmentId), "dev");
      const { key, type, ...fields } = c.req.valid("json");
      checkTypes(type, fields);
      const flag = await config.createFlag(db, environmentId, key, { type, ...fields }, c.get("userId"));
      if (!flag) throw new AppError("conflict", "A flag with that key already exists here");
      return c.json(flag, 201);
    })
    .put("/flags/:flagId", zValidator("param", FlagParam, invalid), zValidator("json", Fields, invalid), async (c) => {
      const existing = await forFlag(c.get("userId"), c.req.valid("param").flagId);
      const fields = c.req.valid("json");
      checkTypes(existing.type, fields);
      return c.json(await config.updateFlag(db, existing.id, fields, c.get("userId")));
    })
    .delete("/flags/:flagId", zValidator("param", FlagParam, invalid), async (c) => {
      const existing = await forFlag(c.get("userId"), c.req.valid("param").flagId);
      await config.deleteFlag(db, existing.id);
      return c.json({ ok: true as const });
    });
}
