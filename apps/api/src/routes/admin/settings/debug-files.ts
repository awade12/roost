import { zValidator } from "@hono/zod-validator";
import { studio, symbolication } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const GameParam = z.object({ gameId: z.uuid() });
const FileParam = GameParam.extend({ fileId: z.uuid() });

/** Uploaded symbol files and source maps, shown in game settings. Uploads come from CI via /v1. */
export function debugFileAdminRoutes({ db, storage }: AppDeps) {
  const forGame = async (userId: string, gameId: string, need: studio.Role) =>
    requireOrgRole(db, userId, await studio.orgOfGame(db, gameId), need);
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/games/:gameId/debug-files", zValidator("param", GameParam, invalid), async (c) => {
      const { gameId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "viewer");
      return c.json({ files: await symbolication.listDebugFiles(db, gameId) });
    })
    .delete("/games/:gameId/debug-files/:fileId", zValidator("param", FileParam, invalid), async (c) => {
      const { gameId, fileId } = c.req.valid("param");
      await forGame(c.get("userId"), gameId, "dev");
      if (!(await symbolication.deleteDebugFile(db, storage, gameId, fileId))) throw new AppError("not_found", "Not found");
      return c.json({ ok: true as const });
    });
}
