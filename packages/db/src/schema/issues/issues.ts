import { index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.ts";
import { environments } from "../studio/games.ts";

export const issueStatus = pgEnum("issue_status", ["unresolved", "resolved", "ignored"]);
export const issueKind = pgEnum("issue_kind", ["crash", "error", "message"]);

/**
 * One row per distinct problem (same fingerprint) in an environment. Status and
 * identity live here; counts come from ClickHouse `crash_events`.
 */
export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    /** Short per-environment number shown in the UI, e.g. #142. */
    number: integer("number").notNull(),
    fingerprint: text("fingerprint").notNull(),
    kind: issueKind("kind").notNull(),
    type: text("type").notNull(),
    message: text("message").notNull(),
    /** Best guess at where it happens: the top in-app frame. */
    culprit: text("culprit"),
    status: issueStatus("status").notNull().default("unresolved"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    firstBuild: text("first_build").notNull(),
    lastBuild: text("last_build").notNull(),
    /** Set when a resolved issue happens again. Cleared when it's resolved again. */
    regressedAt: timestamp("regressed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Set once the issue is sent to Linear. */
    linearIdentifier: text("linear_identifier"),
    linearUrl: text("linear_url"),
  },
  (t) => [
    unique().on(t.environmentId, t.fingerprint),
    unique().on(t.environmentId, t.number),
    index("issues_env_status_seen_idx").on(t.environmentId, t.status, t.lastSeenAt),
  ],
);
