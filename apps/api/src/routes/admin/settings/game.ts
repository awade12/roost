import { zValidator } from "@hono/zod-validator";
import { ai, settings, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const GameParam = z.object({ gameId: z.uuid() });
const Name = z.object({ name: z.string().trim().min(1).max(80) });
const EnvName = z.object({ name: z.string().trim().min(1).max(32).regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase-with-dashes") });

/** Per-game settings: everything a studio can tune without a deploy. */
export function gameSettingsRoutes({ db }: AppDeps) {
  const forGame = async (userId: string, gameId: string, need: studio.Role) =>
    requireOrgRole(db, userId, await studio.orgOfGame(db, gameId), need);

  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/games/:gameId/settings", zValidator("param", GameParam, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      const role = await forGame(c.get("userId"), gameId, "viewer");
      const [current, aiLimits] = await Promise.all([settings.getGameSettings(db, gameId), ai.getLimits(db, gameId)]);
      return c.json({ settings: current, defaults: settings.DEFAULT_SETTINGS, ai: aiLimits, aiDefaults: ai.DEFAULT_LIMITS, canEdit: studio.hasRole(role, "owner") });
    })
    // Pausing the API or changing grouping affects every player, so only owners change settings.
    .put("/games/:gameId/settings", zValidator("param", GameParam, invalid), zValidator("json", settings.GameSettingsSchema, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "owner");
      return c.json({ settings: await settings.saveGameSettings(db, gameId, c.req.valid("json"), c.get("userId")) });
    })
    .patch("/games/:gameId", zValidator("param", GameParam, invalid), zValidator("json", Name, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "dev");
      const game = await studio.renameGame(db, gameId, c.req.valid("json").name);
      if (!game) throw new AppError("not_found", "Not found");
      return c.json(game);
    })
    .post("/games/:gameId/environments", zValidator("param", GameParam, invalid), zValidator("json", EnvName, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "dev");
      const env = await studio.addEnvironment(db, gameId, c.req.valid("json").name);
      if (!env) throw new AppError("conflict", "That environment already exists");
      return c.json(env, 201);
    });
}
