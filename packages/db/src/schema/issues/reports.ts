import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { environments } from "../studio/games.ts";
import { issues } from "./issues.ts";

export const reportCategory = pgEnum("report_category", ["bug", "feedback", "crash", "other"]);
export const reportStatus = pgEnum("report_status", ["open", "closed"]);

/**
 * Bug reports players write in the game. Low volume and they need a status, so they
 * live in Postgres. Attachments (screenshot, save) use the `attachments` table with
 * `crash_id` = report id.
 */
export const playerReports = pgTable(
  "player_reports",
  {
    /** Client-generated; retries are stored once. */
    id: uuid("id").primaryKey(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    sessionId: text("session_id"),
    category: reportCategory("category").notNull(),
    message: text("message").notNull(),
    /** Only when the player chose to share it. Never logged. */
    email: text("email"),
    status: reportStatus("status").notNull().default("open"),
    build: text("build").notNull(),
    platform: text("platform").notNull(),
    osVersion: text("os_version"),
    deviceModel: text("device_model"),
    tags: jsonb("tags").$type<Record<string, string>>().notNull(),
    contexts: jsonb("contexts").$type<Record<string, Record<string, unknown>>>().notNull(),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull(),
    breadcrumbs: jsonb("breadcrumbs").$type<unknown[]>().notNull(),
    attachmentCount: integer("attachment_count").notNull().default(0),
    /** Optional link to the crash issue it's about. */
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    /** When the player sent it (device clock). */
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("player_reports_env_status_idx").on(t.environmentId, t.status, t.receivedAt)],
);
