import { z } from "zod";
import { FlagTypeSchema } from "../config.ts";

// OpenRouter model ids look like "provider/model" or "provider/model:variant".
export const ModelIdSchema = z.string().regex(/^[\w.-]+\/[\w.:-]+$/, "provider/model").max(100);
export const TemplateNameSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "snake_case");
export const FlagKeySchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/, "lowercase, digits, _ . -");

/** A server-side AI prompt template. Games call it by name; the prompt never ships in a build. */
export const TemplateBodySchema = z.object({
  model: ModelIdSchema,
  fallbackModels: z.array(ModelIdSchema).max(3).default([]),
  systemPrompt: z.string().max(8000).default(""),
  userTemplate: z.string().min(1).max(8000),
  maxTokens: z.number().int().min(1).max(4000).default(500),
  temperature: z.number().min(0).max(2).default(0.7),
});

const QuestionKeySchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "snake_case");
const instructions = z.string().min(1).max(2000);
const countBetween = (min: number, max: number) => (o: object) => Object.keys(o).length >= min && Object.keys(o).length <= max;

/**
 * One question of a decision template (OpenRouter Decisions API). `noul` is a yes/no
 * probability, `choice` picks one of the keys in `criteria`, `score` rates on the ordered scale.
 */
export const DecisionQuestionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), instructions, criteria: z.object({ true: z.string().min(1).max(500), false: z.string().min(1).max(500) }).optional() }),
  z.object({
    type: z.literal("choice"),
    instructions,
    criteria: z.record(QuestionKeySchema, z.string().min(1).max(500)).refine(countBetween(2, 50), "2 to 50 choices"),
  }),
  z.object({ type: z.literal("score"), instructions, criteria: z.array(z.string().min(1).max(500)).min(2).max(10) }),
]);

/** A server-side decision template: a decision model and the questions it answers about a state. */
export const DecisionBodySchema = z.object({
  model: ModelIdSchema,
  questions: z.record(QuestionKeySchema, DecisionQuestionSchema).refine(countBetween(1, 20), "1 to 20 questions"),
});

/**
 * A server-side text-to-speech template (OpenRouter's `/audio/speech`). Games say a line with
 * one of the listed voices; the model, format and limits stay on the server.
 */
export const SpeechBodySchema = z.object({
  model: ModelIdSchema,
  /** The voice IDs games may ask for (model-specific, e.g. "alloy" or "en_paul_neutral"). */
  voices: z.array(z.string().min(1).max(100)).min(1).max(200),
  /** `mp3` (audio/mpeg) or raw `pcm`. Some models only do one; see OpenRouter's TTS docs. */
  format: z.enum(["mp3", "pcm"]).default("mp3"),
  /** The longest text a game may send, in characters. */
  maxChars: z.number().int().min(1).max(3000).default(500),
  /** Default delivery guidance (tone, pacing). Only some models use it. */
  instructions: z.string().min(1).max(500).optional(),
});

/** Everything about a flag except its key and type, which never change once games read it. */
export const FlagFieldsSchema = z.object({
  description: z.string().trim().max(500).default(""),
  value: z.unknown(),
  rollout: z.object({ percent: z.number().min(0).max(100), value: z.unknown() }).nullable().default(null),
  overrides: z
    .record(z.string().min(1).max(64), z.unknown())
    .refine((o) => Object.keys(o).length <= 200, "at most 200 overrides")
    .default({}),
});
export const FlagBodySchema = FlagFieldsSchema.extend({ type: FlagTypeSchema });

export const AiLimitsSchema = z.object({
  monthlyCapCents: z.number().int().min(0).max(10_000_000),
  playerDailyTokens: z.number().int().min(0).max(10_000_000),
  playerPerMinute: z.number().int().min(0).max(1000),
});

/**
 * `roost.config.json` (or .ts): templates and flags kept in your repo and synced with
 * `roost push`. Templates belong to the game; flags to the environment of the server key used.
 */
export const RoostConfigSchema = z.object({
  templates: z.record(TemplateNameSchema, TemplateBodySchema).default({}),
  /** Decision templates (added with AI decisions). Like templates, they belong to the game. */
  decisions: z.record(TemplateNameSchema, DecisionBodySchema).default({}),
  /** Text-to-speech templates (added with AI speech). Like templates, they belong to the game. */
  speech: z.record(TemplateNameSchema, SpeechBodySchema).default({}),
  flags: z.record(FlagKeySchema, FlagBodySchema).default({}),
  aiLimits: AiLimitsSchema.optional(),
});

export type TemplateBody = z.infer<typeof TemplateBodySchema>;
export type DecisionQuestion = z.infer<typeof DecisionQuestionSchema>;
export type DecisionBody = z.infer<typeof DecisionBodySchema>;
export type SpeechBody = z.infer<typeof SpeechBodySchema>;
export type FlagBody = z.infer<typeof FlagBodySchema>;
export type FlagFields = z.infer<typeof FlagFieldsSchema>;
export type AiLimitsBody = z.infer<typeof AiLimitsSchema>;
export type RoostConfig = z.infer<typeof RoostConfigSchema>;
