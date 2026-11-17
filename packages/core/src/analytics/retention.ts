import type { Clickhouse } from "@roost/clickhouse";

/** Days after install shown on the Retention page. D0 is the install day itself. */
export const RETENTION_DAYS = [0, 1, 2, 3, 7, 14, 30] as const;

export type RetentionFilters = { days: number; build?: string | undefined; platform?: string | undefined };

export type Cohort = {
  /** Install day (UTC), the player's first event. */
  day: string;
  size: number;
  /** Players active N days after install, keyed by N. Missing = that day hasn't happened yet. */
  retained: Record<number, number>;
};

/**
 * One row per install-day cohort in the window. A player belongs to the cohort of their first
 * event ever in this environment; build and platform filters apply to that first event, so
 * "build 1.4" means players who started on 1.4.
 */
export async function retentionCohorts(ch: Clickhouse, env: string, f: RetentionFilters): Promise<Cohort[]> {
  const firstFilters = [f.build ? "first_build = {build:String}" : "", f.platform ? "first_platform = {platform:String}" : ""].filter(Boolean);
  const result = await ch.query({
    query: `
      WITH firsts AS (
        SELECT player_id, toDate(min(occurred_at)) AS first_day,
               argMin(build, occurred_at) AS first_build, argMin(platform, occurred_at) AS first_platform
        FROM events WHERE environment_id = {env:UUID} GROUP BY player_id
      ),
      cohort AS (
        SELECT player_id, first_day FROM firsts
        WHERE first_day >= today() - {days:UInt32} + 1 ${firstFilters.length ? `AND ${firstFilters.join(" AND ")}` : ""}
      ),
      active AS (
        SELECT DISTINCT player_id, toDate(occurred_at) AS day FROM events
        WHERE environment_id = {env:UUID} AND occurred_at >= today() - {days:UInt32} + 1
          AND player_id IN (SELECT player_id FROM cohort)
      )
      SELECT toString(c.first_day) AS cohort_day, dateDiff('day', c.first_day, a.day) AS offset, uniqExact(a.player_id) AS players
      FROM cohort AS c INNER JOIN active AS a ON a.player_id = c.player_id
      WHERE offset IN {offsets:Array(UInt16)}
      GROUP BY cohort_day, offset
      ORDER BY cohort_day DESC, offset`,
    query_params: { env, days: f.days, offsets: [...RETENTION_DAYS], ...(f.build ? { build: f.build } : {}), ...(f.platform ? { platform: f.platform } : {}) },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ cohort_day: string; offset: number; players: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const cohorts = new Map<string, Cohort>();
  for (const r of rows) {
    const c = cohorts.get(r.cohort_day) ?? { day: r.cohort_day, size: 0, retained: {} };
    if (Number(r.offset) === 0) c.size = Number(r.players);
    c.retained[Number(r.offset)] = Number(r.players);
    cohorts.set(r.cohort_day, c);
  }
  // Only finished days count: today is still filling up, so a cohort's "day N" that is today
  // is left out rather than shown low. Finished days with nobody back get an explicit 0.
  return [...cohorts.values()].map((c) => {
    const age = daysBetween(c.day, today);
    const retained: Record<number, number> = {};
    for (const n of RETENTION_DAYS) {
      if (n > 0 && age <= n) continue;
      retained[n] = c.retained[n] ?? 0;
    }
    return { ...c, retained };
  });
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * Weighted average per day: retained players over the size of every cohort old enough
 * to have reached that day. Null when no cohort has reached it yet.
 */
export function averageRetention(cohorts: Cohort[]): Record<number, number | null> {
  return Object.fromEntries(
    RETENTION_DAYS.map((n) => {
      const reached = cohorts.filter((c) => c.retained[n] !== undefined && c.size > 0);
      const size = reached.reduce((s, c) => s + c.size, 0);
      return [n, size ? reached.reduce((s, c) => s + (c.retained[n] ?? 0), 0) / size : null];
    }),
  );
}
