import { zValidator } from "@hono/zod-validator";
import { integrations, issues } from "@roost/core";
import { Hono } from "hono";
import type { AppDeps } from "../../../app.ts";
import { AppError } from "../../../http/errors.ts";
import { forIssue, invalid } from "../access.ts";
import { requireSession, type SessionVars } from "../auth/index.ts";
import { IssueParam } from "./routes.ts";

type Issue = Awaited<ReturnType<typeof issues.getIssue>> & {};

/** Markdown body for the Linear issue: what, where, how bad, the stack, and a link back. */
function describe(issue: Issue, detail: Awaited<ReturnType<typeof issues.issueDetail>>, dashboardUrl: string | undefined) {
  const lines = [
    `**${issue.type}: ${issue.message}**`,
    issue.culprit ? `\`${issue.culprit}\`` : "",
    "",
    `- Impact: ${detail.events} events, ${detail.players} players`,
    `- First seen ${issue.firstSeenAt.toISOString().slice(0, 10)} in ${issue.firstBuild}; last seen in ${issue.lastBuild}`,
    detail.platforms.length ? `- Platforms: ${detail.platforms.map((p) => `${p.name} (${p.count})`).join(", ")}` : "",
    "",
    detail.latest?.stack ? `\`\`\`\n${detail.latest.stack.slice(0, 6000)}\n\`\`\`` : "",
    dashboardUrl ? `[Open #${issue.number} in Roost](${dashboardUrl}/issues/${issue.id})` : "",
  ];
  return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
}

export function linearRoutes({ db, ch, auth, linear }: AppDeps) {
  return new Hono<{ Variables: SessionVars }>()
    .use(requireSession(db))
    .post("/issues/:issueId/linear", zValidator("param", IssueParam, invalid), async (c) => {
      const { issue, orgId } = await forIssue(db, c.get("userId"), c.req.valid("param").issueId, "dev");
      if (issue.linearUrl) return c.json({ identifier: issue.linearIdentifier, url: issue.linearUrl });
      const connection = await integrations.linearKey(db, auth.secret, orgId);
      if (!connection) throw new AppError("bad_request", "Connect Linear in Settings first");
      const detail = await issues.issueDetail(ch, issue.environmentId, issue.id);
      try {
        const created = await integrations.createLinearIssue(
          connection.apiKey,
          { teamId: connection.config.teamId, title: `#${issue.number} ${issue.type}: ${issue.message}`.slice(0, 250), description: describe(issue, detail, linear.dashboardUrl) },
          linear.fetch,
        );
        await issues.linkLinear(db, issue.id, created, c.get("userId"));
        return c.json(created, 201);
      } catch (err) {
        if (err instanceof integrations.LinearError) throw new AppError("upstream_error", err.message);
        throw err;
      }
    });
}
