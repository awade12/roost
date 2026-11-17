import type { Db } from "@roost/db";
import { sql } from "drizzle-orm";

/** Counts hits per key in fixed windows. `hit` returns the count so far in the current window. */
export type RateStore = { hit(key: string, windowMs: number): Promise<number> };

/** One process only: for tests and single-replica dev. Windows align to the epoch, like Postgres. */
export function memoryRateStore(): RateStore {
  const counts = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, windowMs) {
      const now = Date.now();
      const start = Math.floor(now / windowMs) * windowMs;
      const id = `${key}:${start}`;
      const entry = counts.get(id);
      if (entry) {
        entry.count += 1;
        return Promise.resolve(entry.count);
      }
      // Drop finished windows once the map grows; only expired counts are lost.
      if (counts.size > 50_000) for (const [k, v] of counts) if (v.resetAt <= now) counts.delete(k);
      counts.set(id, { count: 1, resetAt: start + windowMs });
      return Promise.resolve(1);
    },
  };
}

/**
 * Shared across API replicas: one atomic upsert per hit. The window comes from the database
 * clock, so replicas with drifting clocks still agree on it.
 */
export function postgresRateStore(db: Db): RateStore {
  return {
    async hit(key, windowMs) {
      const ms = Math.max(1, Math.round(windowMs));
      const { rows } = await db.execute<{ count: number }>(sql`
        INSERT INTO rate_limits (key, window_start, count, expires_at)
        SELECT ${key}, w.start, 1, w.start + ${ms}::int * interval '1 millisecond'
        FROM (SELECT to_timestamp((floor(extract(epoch FROM now()) * 1000 / ${ms}::int) * ${ms}::int / 1000.0)::float8) AS start) w
        ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
        RETURNING count`);
      return Number(rows[0]?.count ?? 1);
    },
  };
}
