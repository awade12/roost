import { zValidator } from "@hono/zod-validator";
import { issues, reports, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const EnvParam = z.object({ environmentId: z.uuid() });

/** Small numbers for the sidebar badges, for the selected environment. */
export function navRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/environments/:environmentId/nav-counts", zValidator("param", EnvParam, invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), await studio.orgOfEnvironment(db, environmentId), "viewer");
      const [issueCounts, openReports] = await Promise.all([issues.issueBadgeCounts(db, environmentId), reports.openReportCount(db, environmentId)]);
      return c.json({ issues: issueCounts, reports: { open: openReports } });
    });
}
