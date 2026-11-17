import { zValidator } from "@hono/zod-validator";
import { analytics } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import type { KeyVars } from "../../../http/client-key.ts";
import { AppError } from "../../../http/errors.ts";
import { EventFilters } from "../../shared/event-filters.ts";

const bad = (r: { success: boolean }) => {
  if (!r.success) throw new AppError("bad_request", "Invalid query");
};

/** The same data the dashboard shows, for your own scripts, sheets and tools. */
export function queryAnalyticsRoutes({ ch }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .get("/query/events", zValidator("query", EventFilters, bad), async (c) => {
      const { filters, before } = c.req.valid("query");
      return c.json(await analytics.listEvents(ch, c.get("environmentId"), filters, before));
    })
    .get("/query/events/series", zValidator("query", EventFilters, bad), async (c) => {
      const rows = await analytics.eventSeries(ch, c.get("environmentId"), c.req.valid("query").filters);
      return c.json({ series: rows.map((r) => ({ bucket: r.bucket, events: Number(r.events), players: Number(r.players) })) });
    })
    .get("/query/overview", zValidator("query", z.object({ days: z.enum(["7", "30", "90"]).default("30") }), bad), async (c) =>
      c.json(await analytics.getOverview(ch, c.get("environmentId"), Number(c.req.valid("query").days))),
    )
    .get("/query/retention", zValidator("query", z.object({ days: z.enum(["30", "60", "90"]).default("30"), build: z.string().max(64).optional(), platform: z.string().max(16).optional() }), bad), async (c) => {
      const q = c.req.valid("query");
      const cohorts = await analytics.retentionCohorts(ch, c.get("environmentId"), { days: Number(q.days), build: q.build, platform: q.platform });
      return c.json({ days: [...analytics.RETENTION_DAYS], cohorts, average: analytics.averageRetention(cohorts) });
    })
    .get("/query/players/:playerId", zValidator("param", z.object({ playerId: z.string().min(1).max(64) }), bad), async (c) => {
      const profile = await analytics.playerProfile(ch, c.get("environmentId"), c.req.valid("param").playerId);
      if (!profile) throw new AppError("not_found", "No events from this player in this environment");
      return c.json(profile);
    });
}
