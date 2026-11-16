import { zValidator } from "@hono/zod-validator";
import { issues, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { forIssue, invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { IssueParam } from "./routes.ts";

const GameParam = z.object({ gameId: z.uuid() });
const NewLabel = z.object({ name: z.string().trim().min(1).max(40), color: z.enum(issues.LABEL_COLORS) });

/** Comments, activity, and labels (per game). */
export function collabRoutes({ db }: AppDeps) {
  const forGame = async (userId: string, gameId: string, need: studio.Role) =>
    requireOrgRole(db, userId, await studio.orgOfGame(db, gameId), need);

  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/issues/:issueId/activity", zValidator("param", IssueParam, invalid), async (c) => {
      const { issue } = await forIssue(db, c.get("userId"), c.req.valid("param").issueId, "viewer");
      return c.json({ activity: await issues.listActivity(db, issue.id) });
    })
    // Any member (viewers included) can comment: discussion isn't a write to the issue.
    .post("/issues/:issueId/comments", zValidator("param", IssueParam, invalid), zValidator("json", z.object({ body: z.string().trim().min(1).max(10_000) }), invalid), async (c) => {
      const { issue } = await forIssue(db, c.get("userId"), c.req.valid("param").issueId, "viewer");
      return c.json(await issues.addComment(db, issue.id, c.get("userId"), c.req.valid("json").body), 201);
    })
    .delete("/issues/:issueId/comments/:commentId", zValidator("param", IssueParam.extend({ commentId: z.uuid() }), invalid), async (c) => {
      const { issueId, commentId } = c.req.valid("param");
      const { issue } = await forIssue(db, c.get("userId"), issueId, "viewer");
      if (!(await issues.deleteComment(db, issue.id, commentId, c.get("userId")))) throw new AppError("not_found", "Comment not found or not yours");
      return c.json({ ok: true as const });
    })
    .put("/issues/:issueId/labels/:labelId", zValidator("param", IssueParam.extend({ labelId: z.uuid() }), invalid), zValidator("json", z.object({ on: z.boolean() }), invalid), async (c) => {
      const { issueId, labelId } = c.req.valid("param");
      const { issue, gameId } = await forIssue(db, c.get("userId"), issueId, "dev");
      const label = await issues.getLabel(db, labelId);
      if (!label || label.gameId !== gameId) throw new AppError("not_found", "Label not found in this game");
      await issues.setIssueLabel(db, issue.id, label, c.req.valid("json").on, c.get("userId"));
      return c.json({ ok: true as const });
    })
    .get("/games/:gameId/labels", zValidator("param", GameParam, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "viewer");
      return c.json({ labels: await issues.listLabels(db, gameId) });
    })
    .post("/games/:gameId/labels", zValidator("param", GameParam, invalid), zValidator("json", NewLabel, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "dev");
      const { name, color } = c.req.valid("json");
      const label = await issues.createLabel(db, gameId, name, color);
      if (!label) throw new AppError("conflict", "A label with that name already exists");
      return c.json(label, 201);
    })
    .delete("/games/:gameId/labels/:labelId", zValidator("param", GameParam.extend({ labelId: z.uuid() }), invalid), async (c) => {
      const { gameId, labelId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "dev");
      if (!(await issues.deleteLabel(db, gameId, labelId))) throw new AppError("not_found", "Not found");
      return c.json({ ok: true as const });
    });
}
