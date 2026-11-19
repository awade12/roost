import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { issues, reports } from "@roost/core";
import { z } from "zod";
import { fail, json, type ToolContext } from "../context.ts";

const Status = z.enum(["open", "closed"]);

/** A report in this environment only. */
async function find(ctx: ToolContext, id: string) {
  const row = await reports.getReport(ctx.db, id);
  return row && row.environmentId === ctx.environmentId ? row : null;
}

export function registerReportTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_reports",
    {
      title: "List player bug reports",
      description: "Bug reports players sent from inside the game, newest first: their message, category, build, platform and attachment count.",
      inputSchema: { status: Status.default("open"), limit: z.number().int().min(1).max(200).default(50) },
      annotations: { readOnlyHint: true },
    },
    async ({ status, limit }) => json((await reports.listReports(ctx.db, ctx.environmentId, status, limit)).map(({ hasEmail, ...r }) => ({ ...r, playerLeftEmail: Boolean(hasEmail) }))),
  );

  server.registerTool(
    "get_report",
    {
      title: "Get bug report",
      description: "One bug report with device details, tags, breadcrumbs, attachment names and the issue it's linked to. The player's email is never included.",
      inputSchema: { report_id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ report_id }) => {
      const row = await find(ctx, report_id);
      if (!row) return fail(`No report ${report_id} in this environment`);
      // Personal data stays in the dashboard: agents get whether there's an email, not the address.
      const { email, ...report } = row;
      const attachments = await issues.listAttachments(ctx.db, row.id);
      return json({ report: { ...report, playerLeftEmail: email !== null }, attachments });
    },
  );

  server.registerTool(
    "set_report_status",
    {
      title: "Close or reopen a bug report",
      description: "Closes a report once it's handled, or reopens it.",
      inputSchema: { report_id: z.string().uuid(), status: Status },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ report_id, status }) => {
      if (!(await find(ctx, report_id))) return fail(`No report ${report_id} in this environment`);
      await reports.setReportStatus(ctx.db, report_id, status);
      return json({ report_id, status });
    },
  );
}
