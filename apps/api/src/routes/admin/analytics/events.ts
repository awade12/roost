import { zValidator } from "@hono/zod-validator";
import { analytics, studio } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { invalid, requireOrgRole } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { EventFilters as Filters, HOURS, Range } from "../../shared/event-filters.ts";

const EnvParam = z.object({ environmentId: z.uuid() });
/** The Events page: a filtered stream, its chart, and the values the filter menus offer. */
export function eventExplorerRoutes({ db, ch }: AppDeps) {
  const access = async (userId: string, environmentId: string) =>
    requireOrgRole(db, userId, await studio.orgOfEnvironment(db, environmentId), "viewer");

  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .get("/environments/:environmentId/events", zValidator("param", EnvParam, invalid), zValidator("query", Filters, invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await access(c.get("userId"), environmentId);
      const { filters, before } = c.req.valid("query");
      return c.json(await analytics.listEvents(ch, environmentId, filters, before));
    })
    .get("/environments/:environmentId/events/series", zValidator("param", EnvParam, invalid), zValidator("query", Filters, invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await access(c.get("userId"), environmentId);
      const rows = await analytics.eventSeries(ch, environmentId, c.req.valid("query").filters);
      return c.json({ series: rows.map((r) => ({ bucket: r.bucket, events: Number(r.events), players: Number(r.players) })) });
    })
    .get("/environments/:environmentId/events/facets", zValidator("param", EnvParam, invalid), zValidator("query", z.object({ range: Range }), invalid), async (c) => {
      const { environmentId } = c.req.valid("param");
      await access(c.get("userId"), environmentId);
      return c.json(await analytics.eventFacets(ch, environmentId, HOURS[c.req.valid("query").range]));
    });
}
