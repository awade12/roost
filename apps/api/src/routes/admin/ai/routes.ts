import { zValidator } from "@hono/zod-validator";
import { ai, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const GameParam = z.object({ gameId: z.uuid() });
const TemplateParam = z.object({ templateId: z.uuid() });
// OpenRouter model ids look like "provider/model" or "provider/model:variant".
const Model = z.string().regex(/^[\w.-]+\/[\w.:-]+$/, "provider/model").max(100);
const Template = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "snake_case"),
  model: Model,
  fallbackModels: z.array(Model).max(3).default([]),
  systemPrompt: z.string().max(8000),
  userTemplate: z.string().min(1).max(8000),
  maxTokens: z.number().int().min(1).max(4000),
  temperature: z.number().min(0).max(2),
});
const Limits = z.object({
  monthlyCapCents: z.number().int().min(0).max(10_000_000),
  playerDailyTokens: z.number().int().min(0).max(10_000_000),
  playerPerMinute: z.number().int().min(0).max(1000),
});

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
      const [templates, limits, usage] = await Promise.all([
        ai.listTemplates(db, gameId),
        ai.getLimits(db, gameId),
        ai.usageSummary(ch, gameId),
      ]);
      return c.json({ templates, limits, usage });
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
