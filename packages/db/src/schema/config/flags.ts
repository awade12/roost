import { jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.ts";
import { environments } from "../studio/games.ts";

export const flagType = pgEnum("flag_type", ["boolean", "string", "number", "json"]);

/**
 * Remote config and feature flags, per environment. Every player gets `value`, except players
 * in the rollout bucket (a stable hash of flag key + player id) who get `rollout.value`, and
 * players listed in `overrides`. Games read them through GET /v1/config.
 */
export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    type: flagType("type").notNull(),
    description: text("description").notNull().default(""),
    value: jsonb("value").$type<unknown>().notNull(),
    rollout: jsonb("rollout").$type<{ percent: number; value: unknown } | null>(),
    overrides: jsonb("overrides").$type<Record<string, unknown>>().notNull().default({}),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.environmentId, t.key)],
);
