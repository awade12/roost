import { zValidator } from "@hono/zod-validator";
import { issues, reports, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const EnvParam = z.object({ environmentId: z.uuid() });
const ReportParam = z.object({ reportId: z.uuid() });
const Status = z.enum(["open", "closed"]);

/** Player reports in the dashboard. Anyone in the studio reads them; devs close and link them. */
export function reportAdminRoutes({ db }: AppDeps) {
  const forReport = async (userId: string, reportId: string, need: studio.Role) =>
    requireOrgRole(db, userId, await reports.orgOfReport(db, reportId), need);

  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get(
      "/environments/:environmentId/reports",
      zValidator("param", EnvParam, invalid),
      zValidator("query", z.object({ status: Status.default("open") }), invalid),
      async (c) => {
        const { environmentId } = c.req.valid("param");
        await requireOrgRole(db, c.get("userId"), await studio.orgOfEnvironment(db, environmentId), "viewer");
        return c.json({ reports: await reports.listReports(db, environmentId, c.req.valid("query").status) });
      },
    )
    .get("/reports/:reportId", zValidator("param", ReportParam, invalid), async (c) => {
      const { reportId } = c.req.valid("param");
      await forReport(c.get("userId"), reportId, "viewer");
      const report = await reports.getReport(db, reportId);
      if (!report) throw new AppError("not_found", "Not found");
      return c.json({ report, attachments: await issues.listAttachments(db, reportId) });
    })
    .patch("/reports/:reportId", zValidator("param", ReportParam, invalid), zValidator("json", z.object({ status: Status }), invalid), async (c) => {
      const { reportId } = c.req.valid("param");
      await forReport(c.get("userId"), reportId, "dev");
      await reports.setReportStatus(db, reportId, c.req.valid("json").status);
      return c.json({ ok: true as const });
    })
    .put("/reports/:reportId/issue", zValidator("param", ReportParam, invalid), zValidator("json", z.object({ issueId: z.uuid().nullable() }), invalid), async (c) => {
      const { reportId } = c.req.valid("param");
      await forReport(c.get("userId"), reportId, "dev");
      if (!(await reports.linkReportIssue(db, reportId, c.req.valid("json").issueId))) {
        throw new AppError("bad_request", "That issue isn't in this report's environment");
      }
      return c.json({ ok: true as const });
    });
}
