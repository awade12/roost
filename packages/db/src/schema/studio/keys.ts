import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { environments } from "./games.ts";

/** client = shipped inside game builds (low privilege); server = secret. */
export const keyKind = pgEnum("key_kind", ["client", "server"]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  environmentId: uuid("environment_id")
    .notNull()
    .references(() => environments.id, { onDelete: "cascade" }),
  kind: keyKind("kind").notNull(),
  /** First chars of the key, shown in the dashboard so people can tell keys apart. */
  prefix: text("prefix").notNull(),
  /** SHA-256 of the full key. The raw key is shown once and never stored. */
  hash: text("hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
