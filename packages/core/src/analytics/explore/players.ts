import type { Clickhouse } from "@roost/clickhouse";

async function rows<T>(ch: Clickhouse, query: string, params: Record<string, string | number>): Promise<T[]> {
  const result = await ch.query({ query, query_params: params, format: "JSONEachRow" });
  return result.json<T>();
}

export type PlayerRow = { player_id: string; first_seen: string; last_seen: string; events: string; sessions: string; last_build: string; last_platform: string };

/** Players seen in the last 30 days, most recent first; `q` matches any part of the id. */
export function searchPlayers(ch: Clickhouse, env: string, q?: string) {
  const match = q ? "AND positionCaseInsensitive(player_id, {q:String}) > 0" : "";
  return rows<PlayerRow>(
    ch,
    `SELECT player_id, min(occurred_at) AS first_seen, max(occurred_at) AS last_seen, uniqExact(id) AS events,
            uniqExact(session_id) AS sessions, argMax(build, occurred_at) AS last_build, argMax(platform, occurred_at) AS last_platform
     FROM events WHERE environment_id = {env:UUID} AND occurred_at >= now() - INTERVAL 30 DAY ${match}
     GROUP BY player_id ORDER BY last_seen DESC LIMIT 50`,
    { env, ...(q ? { q } : {}) },
  );
}

type Summary = PlayerRow & { days_active: string; builds: string[]; platforms: string[] };

/** One player's whole history in this environment: totals, recent activity, top events, crashes. */
export async function playerProfile(ch: Clickhouse, env: string, playerId: string) {
  const params = { env, player: playerId };
  const where = "environment_id = {env:UUID} AND player_id = {player:String}";
  const [summary, daily, top, crashes] = await Promise.all([
    rows<Summary>(
      ch,
      `SELECT player_id, min(occurred_at) AS first_seen, max(occurred_at) AS last_seen, uniqExact(id) AS events, uniqExact(session_id) AS sessions,
              argMax(build, occurred_at) AS last_build, argMax(platform, occurred_at) AS last_platform, uniqExact(toDate(occurred_at)) AS days_active,
              groupUniqArray(10)(build) AS builds, groupUniqArray(5)(platform) AS platforms
       FROM events WHERE ${where} GROUP BY player_id`,
      params,
    ),
    rows<{ day: string; events: string }>(
      ch,
      `SELECT toString(toDate(occurred_at)) AS day, uniqExact(id) AS events FROM events
       WHERE ${where} AND occurred_at >= today() - 29 GROUP BY day ORDER BY day`,
      params,
    ),
    rows<{ name: string; count: string }>(ch, `SELECT name, uniqExact(id) AS count FROM events WHERE ${where} GROUP BY name ORDER BY count DESC LIMIT 8`, params),
    rows<{ id: string; issue_id: string; type: string; message: string; build: string; occurred_at: string }>(
      ch,
      `SELECT id, issue_id, type, message, build, occurred_at FROM crash_events WHERE ${where} ORDER BY occurred_at DESC LIMIT 1 BY id LIMIT 50`,
      params,
    ),
  ]);
  const s = summary[0];
  if (!s) return null;
  return {
    playerId: s.player_id,
    firstSeen: s.first_seen,
    lastSeen: s.last_seen,
    events: Number(s.events),
    sessions: Number(s.sessions),
    daysActive: Number(s.days_active),
    build: s.last_build,
    platform: s.last_platform,
    builds: s.builds,
    platforms: s.platforms,
    daily: daily.map((d) => ({ day: d.day, events: Number(d.events) })),
    topEvents: top.map((t) => ({ name: t.name, count: Number(t.count) })),
    crashes,
  };
}
