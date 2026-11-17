import { zValidator } from "@hono/zod-validator";
import { analytics, issues, reports, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";

const EnvParam = z.object({ environmentId: z.uuid() });
const PlayerParam = EnvParam.extend({ playerId: z.string().min(1).max(64) });

/** Look up players, and one player's events, crashes and reports. */
export function playerRoutes({ db, ch }: AppDeps) {
  const access = async (userId: string, environmentId: string) =>
    requireOrgRole(db, userId, await studio.orgOfEnvironment(db, environmentId), "viewer");

  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/environments/:environmentId/players", zValidator("param", EnvParam, invalid), zValidator("query", z.object({ q: z.string().trim().max(64).optional() }), invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await access(c.get("userId"), environmentId);
      const rows = await analytics.searchPlayers(ch, environmentId, c.req.valid("query").q || undefined);
      return c.json({ players: rows.map((r) => ({ ...r, events: Number(r.events), sessions: Number(r.sessions) })) });
    })
    .get("/environments/:environmentId/players/:playerId", zValidator("param", PlayerParam, invalid), async (c) => {
      const { environmentId, playerId } = c.req.valid("param");
      await access(c.get("userId"), environmentId);
      const [profile, playerReports] = await Promise.all([analytics.playerProfile(ch, environmentId, playerId), reports.reportsForPlayer(db, environmentId, playerId)]);
      if (!profile) throw new AppError("not_found", "No events from this player in this environment");
      const numbers = await issues.issueNumbers(db, [...new Set(profile.crashes.map((x) => x.issue_id))]);
      const crashes = profile.crashes.map((x) => ({ ...x, issueNumber: numbers.get(x.issue_id) ?? null }));
      return c.json({ profile: { ...profile, crashes }, reports: playerReports });
    });
}
