import { bigint, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { games } from "../studio/games.ts";

export const debugFileKind = pgEnum("debug_file_kind", ["breakpad", "sourcemap"]);

/**
 * Files that turn raw stacks into readable ones, uploaded per game from CI:
 * Breakpad .sym files (from dump_syms) for native crashes, keyed by module name and
 * debug id; source maps for JS, keyed by build and bundle file name. Bytes live in S3.
 */
export const debugFiles = pgTable(
  "debug_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    kind: debugFileKind("kind").notNull(),
    /** Breakpad: the module's debug file name (e.g. game.pdb). Source map: the bundle file name. */
    name: text("name").notNull(),
    /** Breakpad only; "" for source maps. */
    debugId: text("debug_id").notNull().default(""),
    /** Source maps only; "" for Breakpad (debug ids already pin the build). */
    build: text("build").notNull().default(""),
    storageKey: text("storage_key").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.gameId, t.kind, t.name, t.debugId, t.build), index("debug_files_game_build_idx").on(t.gameId, t.kind, t.build)],
);
