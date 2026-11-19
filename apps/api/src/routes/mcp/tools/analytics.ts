import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analytics, reports } from "@roost/core";
import { z } from "zod";
import { fail, json, type ToolContext } from "../context.ts";

const HOURS = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 } as const;

export function registerAnalyticsTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "get_overview",
    {
      title: "Game overview",
      description: "Daily players, new players and events (7-day averages with week-over-week change), day-1 retention, top events, and a per-day series.",
      inputSchema: { days: z.enum(["7", "30", "90"]).default("30") },
      annotations: { readOnlyHint: true },
    },
    async ({ days }) => json(await analytics.getOverview(ctx.ch, ctx.environmentId, Number(days))),
  );

  registerEventTools(server, ctx);
}

/** Raw events, retention and single players. */
function registerEventTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "query_events",
    {
      title: "Query events",
      description: "Raw analytics events, newest first, filtered by time range, event name, player, build, platform or one prop (key = value). Returns up to one page plus a cursor.",
      inputSchema: {
        range: z.enum(["1h", "24h", "7d", "30d"]).default("24h"),
        name: z.string().max(64).optional(),
        player_id: z.string().max(64).optional(),
        build: z.string().max(64).optional(),
        platform: z.string().max(16).optional(),
        prop_key: z.string().max(64).optional(),
        prop_value: z.string().max(1024).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (q) =>
      json(
        await analytics.listEvents(ctx.ch, ctx.environmentId, {
          hours: HOURS[q.range],
          name: q.name,
          playerId: q.player_id,
          build: q.build,
          platform: q.platform,
          prop: q.prop_key && q.prop_value !== undefined ? { key: q.prop_key, value: q.prop_value } : undefined,
        }),
      ),
  );

  server.registerTool(
    "get_retention",
    {
      title: "Retention cohorts",
      description: "Daily new-player cohorts and how many came back on days 1, 3, 7, 14 and 30, optionally for one build or platform.",
      inputSchema: { days: z.enum(["30", "60", "90"]).default("30"), build: z.string().max(64).optional(), platform: z.string().max(16).optional() },
      annotations: { readOnlyHint: true },
    },
    async (q) => {
      const cohorts = await analytics.retentionCohorts(ctx.ch, ctx.environmentId, { days: Number(q.days), build: q.build, platform: q.platform });
      return json({ days: [...analytics.RETENTION_DAYS], cohorts, average: analytics.averageRetention(cohorts) });
    },
  );

  server.registerTool(
    "get_player",
    {
      title: "Look up a player",
      description: "One player's sessions, days active, builds and platforms, top events, crashes and bug reports. Use it when a player contacts support.",
      inputSchema: { player_id: z.string().min(1).max(64) },
      annotations: { readOnlyHint: true },
    },
    async ({ player_id }) => {
      const [profile, playerReports] = await Promise.all([analytics.playerProfile(ctx.ch, ctx.environmentId, player_id), reports.reportsForPlayer(ctx.db, ctx.environmentId, player_id)]);
      if (!profile) return fail(`No events from player ${player_id} in this environment`);
      return json({ profile, reports: playerReports });
    },
  );
}
