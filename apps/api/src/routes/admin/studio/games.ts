import { zValidator } from "@hono/zod-validator";
import { studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { invalid, OrgParam, requireOrgRole } from "../access.ts";

const CreateGame = z.object({ name: z.string().trim().min(1).max(80) });

export function gameRoutes({ db }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/orgs/:orgId/games", zValidator("param", OrgParam, invalid), async (c) => {
      const { orgId } = c.req.valid("param");
      await requireOrgRole(db, c.get("userId"), orgId, "viewer");
      return c.json({ games: await studio.listGames(db, orgId) });
    })
    .post(
      "/orgs/:orgId/games",
      zValidator("param", OrgParam, invalid),
      zValidator("json", CreateGame, invalid),
      async (c) => {
        const { orgId } = c.req.valid("param");
        await requireOrgRole(db, c.get("userId"), orgId, "dev");
        const game = await studio.createGame(db, orgId, c.req.valid("json").name);
        if (!game) throw new AppError("conflict", "A game with that name already exists");
        return c.json(game, 201);
      },
    );
}
