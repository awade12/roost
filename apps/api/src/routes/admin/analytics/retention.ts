import { zValidator } from "@hono/zod-validator";
import { analytics, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const EnvParam = z.object({ environmentId: z.uuid() });
const Query = z.object({
  days: z.enum(["30", "60", "90"]).default("30"),
  build: z.string().trim().min(1).max(64).optional(),
  platform: z.string().trim().min(1).max(16).optional(),
});

/** Install-day cohorts and how many came back on D1, D7, D30… */
export function retentionRoutes({ db, ch }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/environments/:environmentId/retention", zValidator("param", EnvParam, invalid), zValidator("query", Query, invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), await studio.orgOfEnvironment(db, environmentId), "viewer");
      const q = c.req.valid("query");
      const cohorts = await analytics.retentionCohorts(ch, environmentId, { days: Number(q.days), build: q.build, platform: q.platform });
      return c.json({ days: [...analytics.RETENTION_DAYS], cohorts, average: analytics.averageRetention(cohorts) });
    });
}
