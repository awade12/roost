import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { environments } from "../studio/games.ts";

/**
 * Files sent with a crash report (save files, logs, screenshots). The bytes are
 * in S3-compatible storage; this row is the metadata. `id` is client-generated.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    /** The crash report it belongs to (crash_events.id in ClickHouse). */
    crashId: uuid("crash_id").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_crash_idx").on(t.crashId)],
);
