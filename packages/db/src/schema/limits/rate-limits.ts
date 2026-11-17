import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Shared rate-limit counters, so every API replica sees the same counts. One row per key per
 * fixed window. The table is UNLOGGED (set by hand in its migration): no write-ahead log, so
 * hits are cheap, and a Postgres crash just empties it, which only resets the limits.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    /** SHA-256 of the limiter name and its key, so no email or IP is stored. */
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
    /** When the window ends; the worker deletes rows past it. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index("rate_limits_expires_idx").on(t.expiresAt)],
);
