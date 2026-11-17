import { zValidator } from "@hono/zod-validator";
import { AiLimitsSchema, FlagBodySchema, FlagKeySchema, TemplateBodySchema, TemplateNameSchema } from "@roost/contracts";
import { ai, config, settings } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import type { KeyVars } from "../../../http/client-key.ts";
import { AppError } from "../../../http/errors.ts";

const bad = (what: string) => (r: { success: boolean }) => {
  if (!r.success) throw new AppError("bad_request", `Invalid ${what}`);
};

/** One template, flag or setting at a time, for scripts that don't use a config file. */
export function manageItemRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .put("/manage/templates/:name", zValidator("param", z.object({ name: TemplateNameSchema }), bad("template name")), zValidator("json", TemplateBodySchema, bad("template")), async (c) => {
      const result = await ai.upsertTemplate(db, c.get("gameId"), { name: c.req.valid("param").name, ...c.req.valid("json") });
      return c.json({ result }, result === "created" ? 201 : 200);
    })
    .delete("/manage/templates/:name", zValidator("param", z.object({ name: TemplateNameSchema }), bad("template name")), async (c) => {
      if (!(await ai.deleteTemplateByName(db, c.get("gameId"), c.req.valid("param").name))) throw new AppError("not_found", "No template with that name");
      return c.json({ ok: true as const });
    })
    .put("/manage/flags/:key", zValidator("param", z.object({ key: FlagKeySchema }), bad("flag key")), zValidator("json", FlagBodySchema, bad("flag")), async (c) => {
      const body = c.req.valid("json");
      if (!config.flagValuesMatch(body.type, body)) throw new AppError("bad_request", `Every value must be a ${body.type}`);
      const result = await config.upsertFlag(db, c.get("environmentId"), c.req.valid("param").key, body, null);
      if (result === "type_conflict") throw new AppError("conflict", "That flag has a different type; delete it first to change the type");
      return c.json({ result }, result === "created" ? 201 : 200);
    })
    .delete("/manage/flags/:key", zValidator("param", z.object({ key: FlagKeySchema }), bad("flag key")), async (c) => {
      if (!(await config.deleteFlagByKey(db, c.get("environmentId"), c.req.valid("param").key))) throw new AppError("not_found", "No flag with that key");
      return c.json({ ok: true as const });
    })
    .put("/manage/ai-limits", zValidator("json", AiLimitsSchema, bad("limits")), async (c) => c.json(await ai.saveLimits(db, c.get("gameId"), c.req.valid("json"))))
    .get("/manage/settings", async (c) => c.json(await settings.getGameSettings(db, c.get("gameId"))))
    .put("/manage/settings", zValidator("json", settings.GameSettingsSchema, bad("settings")), async (c) => {
      // Settings saved with a key have no user; the dashboard shows them like any other save.
      return c.json(await settings.saveGameSettings(db, c.get("gameId"), c.req.valid("json"), null));
    });
}
