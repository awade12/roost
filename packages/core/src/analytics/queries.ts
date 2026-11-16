import type { Clickhouse } from "@roost/clickhouse";

// All counts use uniqExact(id) / uniqExact(player_id): the events table drops
// SDK retries only at background merge time, so plain count() can double-count.

type Params = { env: string; days: number };

async function rows<T>(ch: Clickhouse, query: string, params: Params): Promise<T[]> {
  const result = await ch.query({ query, query_params: params, format: "JSONEachRow" });
  return result.json<T>();
}

// Each player's first day in this environment, i.e. when they were "new".
const FIRSTS = `firsts AS (
  SELECT player_id, min(toDate(occurred_at)) AS first_day
  FROM events WHERE environment_id = {env:UUID} GROUP BY player_id
)`;

export type DailyRow = { day: string; players: string; events: string; new_players: string };

/** Players, events and new players per UTC day for the last `days` days (today included). */
export function dailyRows(ch: Clickhouse, params: Params) {
  return rows<DailyRow>(
    ch,
    `WITH ${FIRSTS}
    SELECT d.day AS day, d.players AS players, d.events AS events, ifNull(n.new_players, 0) AS new_players
    FROM (
      SELECT toDate(occurred_at) AS day, uniqExact(player_id) AS players, uniqExact(id) AS events
      FROM events
      WHERE environment_id = {env:UUID} AND occurred_at >= today() - {days:UInt32} + 1
      GROUP BY day
    ) AS d
    LEFT JOIN (SELECT first_day AS day, count() AS new_players FROM firsts GROUP BY first_day) AS n USING day
    ORDER BY day`,
    params,
  );
}

export type RetentionRow = { cohort: string; retained: string };

/**
 * D1 retention over players whose first day falls in the window and whose next
 * day is already over (so today's and yesterday's new players aren't counted as lost).
 */
export function d1Retention(ch: Clickhouse, params: Params) {
  return rows<RetentionRow>(
    ch,
    `WITH ${FIRSTS}
    SELECT uniqExact(f.player_id) AS cohort,
           uniqExactIf(f.player_id, toDate(e.occurred_at) = f.first_day + 1) AS retained
    FROM firsts AS f
    INNER JOIN (SELECT player_id, occurred_at FROM events WHERE environment_id = {env:UUID}) AS e
      ON e.player_id = f.player_id
    WHERE f.first_day BETWEEN today() - {days:UInt32} AND today() - 2`,
    params,
  );
}

export type TopEventRow = { name: string; count: string };

/** Most frequent event names in the last 24 hours. */
export function topEvents(ch: Clickhouse, params: Params) {
  return rows<TopEventRow>(
    ch,
    `SELECT name, uniqExact(id) AS count
    FROM events
    WHERE environment_id = {env:UUID} AND occurred_at >= now() - INTERVAL 1 DAY
    GROUP BY name ORDER BY count DESC LIMIT 6`,
    params,
  );
}

/** Has this environment ever received an event? Drives the first-run guide. */
export async function hasEvents(ch: Clickhouse, params: Params): Promise<boolean> {
  const [row] = await rows<{ n: string }>(
    ch,
    "SELECT count() AS n FROM (SELECT 1 FROM events WHERE environment_id = {env:UUID} LIMIT 1)",
    params,
  );
  return Number(row?.n ?? 0) > 0;
}
