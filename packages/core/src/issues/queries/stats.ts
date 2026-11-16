import type { Clickhouse } from "@roost/clickhouse";
import type { Breadcrumb } from "@roost/contracts";

async function rows<T>(ch: Clickhouse, query: string, params: Record<string, string>): Promise<T[]> {
  const result = await ch.query({ query, query_params: params, format: "JSONEachRow" });
  return result.json<T>();
}

export type IssueCounts = { events: number; players: number; last24h: number };

/** Events and affected players per issue over the last 30 days. */
export async function issueCounts(ch: Clickhouse, environmentId: string): Promise<Map<string, IssueCounts>> {
  const data = await rows<{ issue_id: string; events: string; players: string; last24h: string }>(
    ch,
    `SELECT issue_id, uniqExact(id) AS events, uniqExact(player_id) AS players,
            uniqExactIf(id, occurred_at >= now() - INTERVAL 1 DAY) AS last24h
     FROM crash_events
     WHERE environment_id = {env:UUID} AND occurred_at >= now() - INTERVAL 30 DAY
     GROUP BY issue_id`,
    { env: environmentId },
  );
  return new Map(data.map((r) => [r.issue_id, { events: Number(r.events), players: Number(r.players), last24h: Number(r.last24h) }]));
}

type Share = { name: string; count: number };

/** Everything the issue detail panel shows beyond the issue row itself. */
export async function issueDetail(ch: Clickhouse, environmentId: string, issueId: string) {
  const params = { env: environmentId, issue: issueId };
  const where = "environment_id = {env:UUID} AND issue_id = {issue:UUID}";
  const [latest, platforms, builds, totals] = await Promise.all([
    rows<{ stack: string; breadcrumbs: string; build: string; platform: string; os_version: string; device_model: string; occurred_at: string; message: string }>(
      ch,
      `SELECT stack, breadcrumbs, build, platform, os_version, device_model, occurred_at, message
       FROM crash_events WHERE ${where} ORDER BY occurred_at DESC LIMIT 1`,
      params,
    ),
    rows<{ name: string; count: string }>(ch, `SELECT platform AS name, uniqExact(id) AS count FROM crash_events WHERE ${where} GROUP BY name ORDER BY count DESC`, params),
    rows<{ name: string; count: string }>(ch, `SELECT build AS name, uniqExact(id) AS count FROM crash_events WHERE ${where} GROUP BY name ORDER BY count DESC LIMIT 5`, params),
    rows<{ events: string; players: string }>(ch, `SELECT uniqExact(id) AS events, uniqExact(player_id) AS players FROM crash_events WHERE ${where}`, params),
  ]);
  const share = (r: { name: string; count: string }[]): Share[] => r.map((x) => ({ name: x.name, count: Number(x.count) }));
  const last = latest[0];
  return {
    events: Number(totals[0]?.events ?? 0),
    players: Number(totals[0]?.players ?? 0),
    platforms: share(platforms),
    builds: share(builds),
    latest: last
      ? {
          stack: last.stack,
          message: last.message,
          breadcrumbs: JSON.parse(last.breadcrumbs) as Breadcrumb[],
          build: last.build,
          platform: last.platform,
          osVersion: last.os_version,
          deviceModel: last.device_model,
          occurredAt: last.occurred_at,
        }
      : null,
  };
}
