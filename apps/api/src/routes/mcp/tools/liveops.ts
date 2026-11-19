import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ai, config } from "@roost/core";
import { z } from "zod";
import { fail, json, type ToolContext } from "../context.ts";

export function registerLiveOpsTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_flags",
    {
      title: "List flags",
      description: "Every feature flag and config value in this environment: key, type, default value, percentage rollout and per-player overrides.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      json(
        (await config.listFlags(ctx.db, ctx.environmentId)).map((f) => ({
          key: f.key,
          type: f.type,
          value: f.value,
          rollout: f.rollout,
          overrides: Object.keys(f.overrides).length,
          description: f.description,
          updatedAt: f.updatedAt,
        })),
      ),
  );

  server.registerTool(
    "set_flag_value",
    {
      title: "Change a flag's default value",
      description: "Sets the default value players get for an existing flag (the rollout and overrides stay as they are). The value must match the flag's type. Games pick it up on their next config refresh.",
      inputSchema: { key: z.string().min(1).max(128), value: z.unknown().describe("New default, e.g. true, 3, \"blue\" or a JSON object") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ key, value }) => {
      const flag = (await config.listFlags(ctx.db, ctx.environmentId)).find((f) => f.key === key);
      if (!flag) return fail(`No flag "${key}" in this environment. list_flags shows the ones that exist.`);
      if (!config.matchesType(flag.type, value)) return fail(`"${key}" is a ${flag.type} flag; that value doesn't fit`);
      await config.updateFlag(ctx.db, flag.id, { description: flag.description, value, rollout: flag.rollout, overrides: flag.overrides }, null);
      return json({ key, value, previous: flag.value });
    },
  );

  server.registerTool(
    "get_ai_usage",
    {
      title: "AI usage and spend",
      description: "This month's AI spend against the cap, 30-day requests, blocked rate, latency, per-template usage and cost, and the player limits.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [usage, limits] = await Promise.all([ai.usageSummary(ctx.ch, ctx.gameId), ai.getLimits(ctx.db, ctx.gameId)]);
      return json({ usage, limits: { ...limits, monthlyCapUsd: limits.monthlyCapCents / 100 } });
    },
  );
}
