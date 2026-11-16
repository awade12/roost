import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.ts";
import { games } from "./games.ts";

/**
 * Per-game settings the dashboard can change (ingest limits, issue grouping…).
 * Stored as JSON so a new setting needs no migration; `@roost/core` parses it with
 * defaults, so a missing row or field means "use the default".
 */
export const gameSettings = pgTable("game_settings", {
  gameId: uuid("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});
