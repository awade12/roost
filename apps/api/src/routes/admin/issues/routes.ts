import { zValidator } from "@hono/zod-validator";
import { issues, studio } from "@roost/core";
import { memberships } from "@roost/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { forIssue, invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const Status = z.enum(["unresolved", "resolved", "ignored"]);
const EnvParam = z.object({ environmentId: z.uuid() });
export const IssueParam = z.object({ issueId: z.uuid() });

/** List, detail, status and assignee. */
export function issueRoutes({ db, ch }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get(
      "/environments/:environmentId/issues",
      zValidator("param", EnvParam, invalid),
      zValidator("query", z.object({ status: Status.default("unresolved") }), invalid),
      async (c) => {
        const { environmentId } = c.req.valid("param");
        await requireOrgRole(db, c.get("userId"), await studio.orgOfEnvironment(db, environmentId), "viewer");
        const rows = await issues.listIssues(db, environmentId, c.req.valid("query").status);
        const [counts, labels] = await Promise.all([issues.issueCounts(ch, environmentId), issues.labelsForIssues(db, rows.map((r) => r.id))]);
        const empty = { events: 0, players: 0, last24h: 0 };
        return c.json({ issues: rows.map((r) => ({ ...r, ...(counts.get(r.id) ?? empty), labels: labels.get(r.id) ?? [] })) });
      },
    )
    .get("/issues/:issueId", zValidator("param", IssueParam, invalid), async (c) => {
      const { issue, gameId, orgId } = await forIssue(db, c.get("userId"), c.req.valid("param").issueId, "viewer");
      const [detail, tags, labels] = await Promise.all([
        issues.issueDetail(ch, issue.environmentId, issue.id),
        issues.tagBreakdown(ch, issue.environmentId, issue.id),
        issues.labelsForIssues(db, [issue.id]),
      ]);
      return c.json({ issue: { ...issue, labels: labels.get(issue.id) ?? [] }, detail, tags, gameId, orgId });
    })
    .patch("/issues/:issueId", zValidator("param", IssueParam, invalid), zValidator("json", z.object({ status: Status })), async (c) => {
      const { issue } = await forIssue(db, c.get("userId"), c.req.valid("param").issueId, "dev");
      return c.json(await issues.setIssueStatus(db, issue.id, c.req.valid("json").status, c.get("userId")));
    })
    .put(
      "/issues/:issueId/assignee",
      zValidator("param", IssueParam, invalid),
      zValidator("json", z.object({ userId: z.uuid().nullable() }), invalid),
      async (c) => {
        const { issue, orgId } = await forIssue(db, c.get("userId"), c.req.valid("param").issueId, "dev");
        const assignee = c.req.valid("json").userId;
        if (assignee) {
          const [member] = await db
            .select()
            .from(memberships)
            .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, assignee)));
          if (!member) throw new AppError("bad_request", "Assignee isn't in this studio");
        }
        return c.json(await issues.assignIssue(db, issue.id, assignee, c.get("userId")));
      },
    );
}
