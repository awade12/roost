import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.ts";
import { issueKind, issues } from "../issues/issues.ts";
import { environments, games } from "../studio/games.ts";

export const alertTrigger = pgEnum("alert_trigger", ["new_issue", "regression", "spike"]);

/** "Tell #crashes on Discord when a new crash shows up in production." */
export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  environmentId: uuid("environment_id")
    .notNull()
    .references(() => environments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: alertTrigger("trigger").notNull(),
  /** Which issue kinds count. */
  kinds: issueKind("kinds").array().notNull(),
  /** Spike only: this many events… */
  threshold: integer("threshold").notNull().default(50),
  /** …within this many minutes. */
  windowMinutes: integer("window_minutes").notNull().default(60),
  /** Quiet time per issue after an alert, so a crash loop sends one message, not hundreds. */
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  /** Deleted channels are skipped, so this is not a foreign key. */
  channelIds: uuid("channel_ids").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Each alert sent: drives cooldowns, "fire once per new issue", and the history list. */
export const alertFirings = pgTable(
  "alert_firings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    /** Channels that accepted it, and the first delivery error (without secrets). */
    delivered: integer("delivered").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("alert_firings_rule_issue_idx").on(t.ruleId, t.issueId, t.firedAt)],
);
