import type { Clickhouse } from "@roost/clickhouse";
import { alertFirings, alertRules, environments, games, issues, type Db } from "@roost/db";
import { and, eq, gte, inArray, isNotNull, ne, notExists, sql } from "drizzle-orm";
import type { Mailer } from "../email/index.ts";
import { listMembers } from "../studio/index.ts";
import { loadChannels, type Channel } from "./channels.ts";
import { deliver, type AlertMessage } from "./deliver.ts";
import type { Rule } from "./rules.ts";

export type AlertDeps = {
  db: Db;
  ch: Clickhouse;
  /** AUTH_SECRET, to decrypt webhook URLs. */
  secret: string;
  fetch: typeof fetch;
  mailer: Mailer | null;
  dashboardUrl: string | null;
  now?: Date;
  /** Only check this game's rules (tests, so they never touch other data in a shared database). */
  onlyGameId?: string;
};

type Issue = typeof issues.$inferSelect;
type Target = { rule: Rule; game: string; orgId: string; env: string };

/** Per rule per run, so a burst of new issues can't send hundreds of messages at once. */
const MAX_PER_RULE = 10;
const DAY_MS = 86_400_000;

/** Checks every enabled rule once and sends what's due. Runs every minute in the worker. */
export async function runAlerts(deps: AlertDeps): Promise<{ fired: number }> {
  const targets = await deps.db
    .select({ rule: alertRules, game: games.name, orgId: games.orgId, env: environments.name })
    .from(alertRules)
    .innerJoin(games, eq(games.id, alertRules.gameId))
    .innerJoin(environments, eq(environments.id, alertRules.environmentId))
    .where(and(eq(alertRules.enabled, true), deps.onlyGameId ? eq(alertRules.gameId, deps.onlyGameId) : undefined));
  let fired = 0;
  for (const target of targets) {
    for (const { issue, count } of await candidates(deps, target.rule)) {
      await fire(deps, target, issue, count);
      fired += 1;
    }
  }
  return { fired };
}

async function candidates(deps: AlertDeps, rule: Rule): Promise<{ issue: Issue; count: number | null }[]> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const base = and(eq(issues.environmentId, rule.environmentId), inArray(issues.kind, rule.kinds), ne(issues.status, "ignored"));
  const firedFor = (...extra: ReturnType<typeof eq>[]) =>
    db.select({ one: sql`1` }).from(alertFirings).where(and(eq(alertFirings.ruleId, rule.id), eq(alertFirings.issueId, issues.id), ...extra));

  if (rule.trigger === "new_issue") {
    // Only issues first seen after the rule existed (and recently), each alerted once.
    const since = new Date(Math.max(rule.createdAt.getTime(), now.getTime() - DAY_MS));
    const rows = await db.select().from(issues).where(and(base, gte(issues.firstSeenAt, since), notExists(firedFor()))).limit(MAX_PER_RULE);
    return rows.map((issue) => ({ issue, count: null }));
  }
  if (rule.trigger === "regression") {
    // Once per regression: a later firing than the latest regressed_at means it's been sent.
    const rows = await db
      .select()
      .from(issues)
      .where(and(base, eq(issues.status, "unresolved"), isNotNull(issues.regressedAt), gte(issues.regressedAt, rule.createdAt), notExists(firedFor(sql`${alertFirings.firedAt} >= ${issues.regressedAt}`))))
      .limit(MAX_PER_RULE);
    return rows.map((issue) => ({ issue, count: null }));
  }
  const counts = await spikeCounts(deps.ch, rule);
  if (counts.size === 0) return [];
  const quietSince = new Date(now.getTime() - rule.cooldownMinutes * 60_000);
  const rows = await db
    .select()
    .from(issues)
    .where(and(base, inArray(issues.id, [...counts.keys()]), notExists(firedFor(gte(alertFirings.firedAt, quietSince)))))
    .limit(MAX_PER_RULE);
  return rows.map((issue) => ({ issue, count: counts.get(issue.id) ?? null }));
}

/** Issues with at least `threshold` events received in the last `windowMinutes`. */
async function spikeCounts(ch: Clickhouse, rule: Rule): Promise<Map<string, number>> {
  const result = await ch.query({
    query: `SELECT issue_id, uniqExact(id) AS c FROM crash_events
            WHERE environment_id = {env:UUID} AND received_at >= now64(3) - toIntervalMinute({window:UInt32})
            GROUP BY issue_id HAVING c >= {threshold:UInt32} ORDER BY c DESC LIMIT 50`,
    query_params: { env: rule.environmentId, window: rule.windowMinutes, threshold: rule.threshold },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ issue_id: string; c: string }>();
  return new Map(rows.map((r) => [r.issue_id, Number(r.c)]));
}

function messageFor(deps: AlertDeps, { rule, game, env }: Target, issue: Issue, count: number | null): AlertMessage {
  const where = `${game} · ${env}`;
  const title =
    rule.trigger === "new_issue"
      ? `New ${issue.kind} in ${where}`
      : rule.trigger === "regression"
        ? `Regression in ${where}`
        : `Spike in ${where}: ${count ?? "?"} events in ${rule.windowMinutes} min`;
  const url = deps.dashboardUrl ? `${deps.dashboardUrl.replace(/\/$/, "")}/issues/${issue.id}` : null;
  const details = [
    ...(issue.culprit ? [{ label: "Where", value: issue.culprit }] : []),
    { label: "Builds", value: issue.firstBuild === issue.lastBuild ? issue.lastBuild : `${issue.firstBuild} → ${issue.lastBuild}` },
    { label: "Rule", value: rule.name },
  ];
  return {
    trigger: rule.trigger,
    title,
    summary: `#${issue.number} ${issue.type}: ${issue.message}`.slice(0, 400),
    url,
    details,
    data: {
      rule: { id: rule.id, name: rule.name },
      game,
      environment: env,
      issue: { id: issue.id, number: issue.number, kind: issue.kind, type: issue.type, message: issue.message, culprit: issue.culprit, count },
    },
  };
}

async function fire(deps: AlertDeps, target: Target, issue: Issue, count: number | null): Promise<void> {
  const channels: Channel[] = await loadChannels(deps.db, deps.secret, target.orgId, target.rule.channelIds);
  const emails = async (recipients: "everyone" | "owners") =>
    (await listMembers(deps.db, target.orgId)).filter((m) => recipients === "everyone" || m.role === "owner").map((m) => m.email);
  const message = messageFor(deps, target, issue, count);
  const results = await Promise.all(channels.map((c) => deliver(c, message, { fetch: deps.fetch, mailer: deps.mailer, emails })));
  const errors = results.filter((r): r is string => r !== null);
  // Recorded even when every channel failed, so a broken webhook can't cause a retry storm;
  // the error shows in the dashboard's alert history instead.
  await deps.db.insert(alertFirings).values({
    ruleId: target.rule.id,
    issueId: issue.id,
    delivered: results.length - errors.length,
    error: errors[0] ?? (channels.length === 0 ? "No channels" : null),
  });
}
