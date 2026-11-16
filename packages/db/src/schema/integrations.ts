import { jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./studio/orgs.ts";

export const integrationKind = pgEnum("integration_kind", ["linear"]);

/**
 * Third-party connections per studio. `secret` holds the API key encrypted
 * (AES-256-GCM, key derived from AUTH_SECRET); it is never returned by the API.
 */
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: integrationKind("kind").notNull(),
    secret: text("secret").notNull(),
    /** Non-secret settings, e.g. { teamId, teamName } for Linear. */
    config: jsonb("config").$type<Record<string, string>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.orgId, t.kind)],
);
