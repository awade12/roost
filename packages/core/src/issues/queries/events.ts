import type { Clickhouse } from "@roost/clickhouse";
import type { Breadcrumb } from "@roost/contracts";

const PAGE = 25;

async function rows<T>(ch: Clickhouse, query: string, params: Record<string, string | number>): Promise<T[]> {
  const result = await ch.query({ query, query_params: params, format: "JSONEachRow" });
  return result.json<T>();
}

export type EventSummary = {
  id: string;
  occurredAt: string;
  build: string;
  platform: string;
  deviceModel: string;
  playerId: string;
  level: string;
  attachments: number;
};

/** Occurrences of an issue, newest first. `before` is the occurredAt of the last row seen. */
export async function listEvents(ch: Clickhouse, environmentId: string, issueId: string, before?: string): Promise<EventSummary[]> {
  const data = await rows<{ id: string; occurred_at: string; build: string; platform: string; device_model: string; player_id: string; level: string; attachments: number }>(
    ch,
    `SELECT id, occurred_at, build, platform, device_model, player_id, level, attachments
     FROM crash_events FINAL
     WHERE environment_id = {env:UUID} AND issue_id = {issue:UUID}
       ${before ? "AND occurred_at < parseDateTime64BestEffort({before:String}, 3, 'UTC')" : ""}
     ORDER BY occurred_at DESC LIMIT {limit:UInt32}`,
    { env: environmentId, issue: issueId, limit: PAGE, ...(before ? { before } : {}) },
  );
  return data.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    build: r.build,
    platform: r.platform,
    deviceModel: r.device_model,
    playerId: r.player_id,
    level: r.level,
    attachments: Number(r.attachments),
  }));
}

/** One occurrence with everything the SDK sent. */
export async function getEvent(ch: Clickhouse, environmentId: string, issueId: string, eventId: string) {
  const [r] = await rows<Record<string, string>>(
    ch,
    `SELECT id, occurred_at, build, platform, os_version, device_model, player_id, session_id, kind, level,
            type, message, stack, breadcrumbs, tags, contexts, extra
     FROM crash_events FINAL
     WHERE environment_id = {env:UUID} AND issue_id = {issue:UUID} AND id = {id:UUID} LIMIT 1`,
    { env: environmentId, issue: issueId, id: eventId },
  );
  if (!r) return null;
  return {
    id: String(r.id),
    occurredAt: String(r.occurred_at),
    build: String(r.build),
    platform: String(r.platform),
    osVersion: String(r.os_version),
    deviceModel: String(r.device_model),
    playerId: String(r.player_id),
    sessionId: String(r.session_id),
    kind: String(r.kind),
    level: String(r.level),
    type: String(r.type),
    message: String(r.message),
    stack: String(r.stack),
    breadcrumbs: JSON.parse(String(r.breadcrumbs)) as Breadcrumb[],
    tags: r.tags as unknown as Record<string, string>,
    contexts: JSON.parse(String(r.contexts || "{}")) as Record<string, Record<string, unknown>>,
    extra: JSON.parse(String(r.extra || "{}")) as Record<string, unknown>,
  };
}

/** The most common values of each tag on an issue, for the sidebar breakdown. */
export async function tagBreakdown(ch: Clickhouse, environmentId: string, issueId: string) {
  const data = await rows<{ key: string; value: string; count: string }>(
    ch,
    `SELECT key, value, uniqExact(id) AS count
     FROM crash_events ARRAY JOIN mapKeys(tags) AS key, mapValues(tags) AS value
     WHERE environment_id = {env:UUID} AND issue_id = {issue:UUID}
     GROUP BY key, value ORDER BY key, count DESC LIMIT 3 BY key LIMIT 60`,
    { env: environmentId, issue: issueId },
  );
  const byKey = new Map<string, { value: string; count: number }[]>();
  for (const r of data) byKey.set(r.key, [...(byKey.get(r.key) ?? []), { value: r.value, count: Number(r.count) }]);
  return [...byKey.entries()].map(([key, values]) => ({ key, values }));
}
