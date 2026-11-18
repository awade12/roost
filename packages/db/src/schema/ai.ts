import { integer, jsonb, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { games } from "./studio/games.ts";

/**
 * Server-side prompt templates. Games call a template by name with variables;
 * the prompt and model live here so they can change without an app update.
 */
export const aiTemplates = pgTable(
  "ai_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Bumped on every edit; logged with each call so changes can be compared. */
    version: integer("version").notNull().default(1),
    model: text("model").notNull(),
    /** Tried in order if the main model errors or times out (OpenRouter `models`). */
    fallbackModels: text("fallback_models").array().notNull().default([]),
    systemPrompt: text("system_prompt").notNull(),
    /** User message with {{variable}} placeholders filled from the game's request. */
    userTemplate: text("user_template").notNull(),
    maxTokens: integer("max_tokens").notNull().default(500),
    temperature: real("temperature").notNull().default(0.7),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.gameId, t.name)],
);

/** Per-game spend and abuse limits. A game without a row uses the defaults below. */
export const aiSettings = pgTable("ai_settings", {
  gameId: uuid("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  monthlyCapCents: integer("monthly_cap_cents").notNull().default(5000),
  playerDailyTokens: integer("player_daily_tokens").notNull().default(20000),
  playerPerMinute: integer("player_per_minute").notNull().default(10),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Server-side decision templates (OpenRouter's Decisions API). Games call one by name with a
 * piece of state; the questions (yes/no, choice, score) and model live here.
 */
export const aiDecisions = pgTable(
  "ai_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Bumped on every real edit; logged with each call like template versions. */
    version: integer("version").notNull().default(1),
    model: text("model").notNull(),
    /** The questions object sent to OpenRouter, validated by DecisionBodySchema on the way in. */
    questions: jsonb("questions").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.gameId, t.name)],
);

/**
 * Server-side text-to-speech templates (OpenRouter's `/audio/speech`). Games say a line by name
 * with one of the allowed voices; the model, format and length limit live here.
 */
export const aiSpeech = pgTable(
  "ai_speech",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Bumped on every real edit; logged with each call like template versions. */
    version: integer("version").notNull().default(1),
    model: text("model").notNull(),
    /** Allowed voice IDs, validated by SpeechBodySchema on the way in. */
    voices: jsonb("voices").notNull(),
    /** "mp3" or "pcm". */
    format: text("format").notNull().default("mp3"),
    maxChars: integer("max_chars").notNull().default(500),
    /** Default delivery instructions; null when the template has none. */
    instructions: text("instructions"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.gameId, t.name)],
);
