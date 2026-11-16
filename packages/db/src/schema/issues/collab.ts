import { index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "../auth.ts";
import { games } from "../studio/games.ts";
import { issues } from "./issues.ts";

/** Labels are per game, so production and development issues share them. */
export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** One of the dashboard's label swatches, e.g. "blue". */
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.gameId, t.name)],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.labelId] })],
);

export const activityKind = pgEnum("activity_kind", ["comment", "status", "assigned", "labeled", "unlabeled", "linear"]);

/** Comments and everything else that happened to an issue, in one timeline. */
export const issueActivity = pgTable(
  "issue_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    /** Null for things Roost did itself (e.g. a regression reopening the issue). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: activityKind("kind").notNull(),
    /** Comment text (comments only). */
    body: text("body"),
    /** Kind-specific details, e.g. { from: "unresolved", to: "resolved" }. */
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("issue_activity_issue_idx").on(t.issueId, t.createdAt)],
);
