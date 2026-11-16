import { zValidator } from "@hono/zod-validator";
import { analytics, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const EnvParam = z.object({ environmentId: z.uuid() });
const Range = z.object({ days: z.enum(["7", "30", "90"]).default("30") });

export function overviewRoutes({ db, ch }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get(
      "/environments/:environmentId/overview",
      zValidator("param", EnvParam, invalid),
      zValidator("query", Range, invalid),
      async (c) => {
        const { environmentId } = c.req.valid("param");
        await requireOrgRole(db, c.get("userId"), await studio.orgOfEnvironment(db, environmentId), "viewer");
        return c.json(await analytics.getOverview(ch, environmentId, Number(c.req.valid("query").days)));
      },
    );
}
