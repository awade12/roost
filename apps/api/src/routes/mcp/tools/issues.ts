import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { issues } from "@roost/core";
import { z } from "zod";
import { fail, json, type ToolContext } from "../context.ts";

const Status = z.enum(["unresolved", "resolved", "ignored"]);
const IssueRef = z.union([z.number().int().positive(), z.string().uuid()]).describe("The issue's number (142) or its id");

/** Finds an issue in this environment only; anything else is "not found", never another game's issue. */
async function find(ctx: ToolContext, ref: number | string) {
  const row = typeof ref === "number" ? await issues.issueByNumber(ctx.db, ctx.environmentId, ref) : await issues.getIssue(ctx.db, ref);
  return row && row.environmentId === ctx.environmentId ? row : null;
}

type IssueRow = NonNullable<Awaited<ReturnType<typeof issues.getIssue>>>;

/** The fields an agent needs to pick an issue, without internal ids it can't use. */
const summary = (r: IssueRow) => ({
  number: r.number,
  id: r.id,
  kind: r.kind,
  type: r.type,
  message: r.message,
  culprit: r.culprit,
  status: r.status,
  regressed: r.regressedAt !== null,
  firstSeen: r.firstSeenAt,
  lastSeen: r.lastSeenAt,
  lastBuild: r.lastBuild,
});

export function registerIssueTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description: "Crash and error groups in this environment, most recently seen first, with 30-day event and player counts and events in the last 24 hours.",
      inputSchema: { status: Status.default("unresolved"), limit: z.number().int().min(1).max(200).default(50) },
      annotations: { readOnlyHint: true },
    },
    async ({ status, limit }) => {
      const [rows, counts] = await Promise.all([issues.listIssues(ctx.db, ctx.environmentId, status), issues.issueCounts(ctx.ch, ctx.environmentId)]);
      const empty = { events: 0, players: 0, last24h: 0 };
      return json(rows.slice(0, limit).map((r) => ({ ...summary(r), ...(counts.get(r.id) ?? empty) })));
    },
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get issue",
      description: "One issue with totals, platforms, builds, the latest stack trace and the breadcrumbs before it happened. Use this to debug a crash.",
      inputSchema: { issue: IssueRef },
      annotations: { readOnlyHint: true },
    },
    async ({ issue }) => {
      const row = await find(ctx, issue);
      if (!row) return fail(`No issue ${issue} in this environment`);
      const [detail, tags] = await Promise.all([issues.issueDetail(ctx.ch, ctx.environmentId, row.id), issues.tagBreakdown(ctx.ch, ctx.environmentId, row.id)]);
      return json({ issue: row, ...detail, tags });
    },
  );

  server.registerTool(
    "set_issue_status",
    {
      title: "Resolve, ignore or reopen an issue",
      description: "Marks an issue resolved, ignored or unresolved (reopen). Resolving clears its regression flag; if it happens again it comes back as regressed.",
      inputSchema: { issue: IssueRef, status: Status },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ issue, status }) => {
      const row = await find(ctx, issue);
      if (!row) return fail(`No issue ${issue} in this environment`);
      const updated = await issues.setIssueStatus(ctx.db, row.id, status, null, "mcp");
      return json({ number: row.number, status: updated?.status ?? status });
    },
  );
}
