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
  flags: z.record(FlagKeySchema, FlagBodySchema).default({}),
  aiLimits: AiLimitsSchema.optional(),
});

export type TemplateBody = z.infer<typeof TemplateBodySchema>;
export type FlagBody = z.infer<typeof FlagBodySchema>;
export type FlagFields = z.infer<typeof FlagFieldsSchema>;
export type AiLimitsBody = z.infer<typeof AiLimitsSchema>;
export type RoostConfig = z.infer<typeof RoostConfigSchema>;
