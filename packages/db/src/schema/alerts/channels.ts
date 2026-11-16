import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgs } from "../studio/orgs.ts";

export const alertChannelKind = pgEnum("alert_channel_kind", ["discord", "slack", "webhook", "email"]);

/**
 * Where alerts go, per studio. Webhook URLs are secrets (anyone holding one can post),
 * so `secret` holds them encrypted like integration keys; email channels have none.
 */
export const alertChannels = pgTable("alert_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  kind: alertChannelKind("kind").notNull(),
  name: text("name").notNull(),
  secret: text("secret"),
  /** Non-secret settings, e.g. { recipients: "owners" } for email. */
  config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
