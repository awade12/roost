import { zValidator } from "@hono/zod-validator";
import { AiLimitsSchema, TemplateBodySchema, TemplateNameSchema } from "@roost/contracts";
import { ai, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const GameParam = z.object({ gameId: z.uuid() });
const TemplateParam = z.object({ templateId: z.uuid() });
// Shared with /v1/manage and the CLI, so a template is valid the same way everywhere.
const Template = TemplateBodySchema.extend({ name: TemplateNameSchema });
const Limits = AiLimitsSchema;

export function aiAdminRoutes({ db, ch }: AppDeps) {
  const forGame = async (userId: string, gameId: string, need: studio.Role) =>
    requireOrgRole(db, userId, await studio.orgOfGame(db, gameId), need);
  const forTemplate = async (userId: string, id: string) =>
    requireOrgRole(db, userId, await ai.orgOfTemplate(db, id), "dev");

  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/games/:gameId/ai", zValidator("param", GameParam, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "viewer");
      const [templates, decisions, speech, limits, usage] = await Promise.all([
        ai.listTemplates(db, gameId),
        ai.listDecisions(db, gameId),
        ai.listSpeech(db, gameId),
        ai.getLimits(db, gameId),
        ai.usageSummary(ch, gameId),
      ]);
      return c.json({ templates, decisions, speech, limits, usage });
    })
    .post("/games/:gameId/ai/templates", zValidator("param", GameParam, invalid), zValidator("json", Template, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "dev");
      const created = await ai.createTemplate(db, gameId, c.req.valid("json"));
      if (!created) throw new AppError("conflict", "A template with that name already exists");
      return c.json(created, 201);
    })
    .put("/ai/templates/:templateId", zValidator("param", TemplateParam, invalid), zValidator("json", Template, invalid), async (c) => {
      const { templateId } = c.req.valid("param");
      await forTemplate(c.get("userId"), templateId);
      const updated = await ai.updateTemplate(db, templateId, c.req.valid("json"));
      if (!updated) throw new AppError("not_found", "Not found");
      return c.json(updated);
    })
    .delete("/ai/templates/:templateId", zValidator("param", TemplateParam, invalid), async (c) => {
      const { templateId } = c.req.valid("param");
      await forTemplate(c.get("userId"), templateId);
      await ai.deleteTemplate(db, templateId);
      return c.json({ ok: true as const });
    })
    .put("/games/:gameId/ai/limits", zValidator("param", GameParam, invalid), zValidator("json", Limits, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      // Limits control spend, so only owners change them.
      await forGame(c.get("userId"), gameId, "owner");
      return c.json(await ai.saveLimits(db, gameId, c.req.valid("json")));
    });
}
