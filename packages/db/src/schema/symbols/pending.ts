import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { environments } from "../studio/games.ts";

export const pendingKind = pgEnum("pending_crash_kind", ["native", "js"]);
export const pendingStatus = pgEnum("pending_crash_status", ["waiting", "ready", "processing", "failed"]);

/**
 * Crashes that need symbolication before they can be grouped: native minidumps, and JS
 * crashes from builds with uploaded source maps. The worker processes `ready` rows,
 * records the crash, and deletes the row. `waiting` = the minidump hasn't arrived yet.
 */
export const pendingCrashes = pgTable(
  "pending_crashes",
  {
    /** The crash id the report will get. */
    id: uuid("id").primaryKey(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").notNull(),
    kind: pendingKind("kind").notNull(),
    /** `{ context, report }` (native) or `{ context, crash }` (js), as received. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    dumpKey: text("dump_key"),
    status: pendingStatus("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pending_crashes_status_idx").on(t.status, t.createdAt)],
);
