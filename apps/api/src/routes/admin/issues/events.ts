import { zValidator } from "@hono/zod-validator";
import { issues } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { forIssue, invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { IssueParam } from "./routes.ts";

/** Individual occurrences of an issue, and attachment downloads. */
export function eventRoutes({ db, ch, storage }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get(
      "/issues/:issueId/events",
      zValidator("param", IssueParam, invalid),
      zValidator("query", z.object({ before: z.string().max(40).optional() }), invalid),
      async (c) => {
        const { issue } = await forIssue(db, c.get("userId"), c.req.valid("param").issueId, "viewer");
        return c.json({ events: await issues.listEvents(ch, issue.environmentId, issue.id, c.req.valid("query").before) });
      },
    )
    .get("/issues/:issueId/events/:eventId", zValidator("param", IssueParam.extend({ eventId: z.uuid() }), invalid), async (c) => {
      const { issueId, eventId } = c.req.valid("param");
      const { issue } = await forIssue(db, c.get("userId"), issueId, "viewer");
      const event = await issues.getEvent(ch, issue.environmentId, issue.id, eventId);
      if (!event) throw new AppError("not_found", "Event not found");
      return c.json({ ...event, attachments: await issues.listAttachments(db, event.id) });
    })
    .get("/attachments/:attachmentId", zValidator("param", z.object({ attachmentId: z.uuid() }), invalid), async (c) => {
      const file = await issues.getAttachment(db, storage, c.req.valid("param").attachmentId);
      await requireOrgRole(db, c.get("userId"), file?.orgId ?? null, "viewer");
      if (!file) throw new AppError("not_found", "Not found");
      // Always a download (never rendered inline): attachments come from players' devices.
      return c.body(file.body as Uint8Array<ArrayBuffer>, 200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "x-content-type-options": "nosniff",
      });
    });
}
