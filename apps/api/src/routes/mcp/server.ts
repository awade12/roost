import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.ts";
import { registerAnalyticsTools } from "./tools/analytics.ts";
import { registerIssueTools } from "./tools/issues.ts";
import { registerLiveOpsTools } from "./tools/liveops.ts";
import { registerReportTools } from "./tools/reports.ts";

const INSTRUCTIONS = `Roost is the game's backend: analytics, crash and error issues, player bug reports, feature flags and AI usage.
Everything here is scoped to one game environment (the server key's), so you never see another game's data.
Start with get_overview or list_issues. Refer to issues by their number (#142). Use get_issue for the stack trace and breadcrumbs before changing code.
Writes (set_issue_status, set_report_status, set_flag_value) change what players and the team see: say what you'll change before calling them.`;

/** A fresh server per request: stateless, so any API replica can answer any call. */
export function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "roost", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerIssueTools(server, ctx);
  registerReportTools(server, ctx);
  registerAnalyticsTools(server, ctx);
  registerLiveOpsTools(server, ctx);
  return server;
}
