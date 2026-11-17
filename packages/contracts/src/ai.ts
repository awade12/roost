import { z } from "zod";

const MODEL_ID = /^[\w.-]+\/[\w.:-]+$/;
const turns = <const R extends readonly [string, ...string[]]>(roles: R) =>
  z
    .array(z.object({ role: z.enum(roles), content: z.string().max(8000) }))
    .max(40)
    .refine((m) => m.reduce((n, t) => n + t.content.length, 0) <= 48_000, "messages over 48,000 characters");

/** POST /v1/ai/run — run a server-side prompt template by name. */
export const AiRunSchema = z.object({
  template: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "snake_case"),
  /** Values for the template's {{placeholders}}. */
  vars: z.record(z.string().max(64), z.union([z.string().max(4000), z.number(), z.boolean()])).default({}),
  /** Budgets and rate limits apply per player. */
  playerId: z.string().min(1).max(64),
  /**
   * Earlier turns of a conversation (added with the AI proxy chat update). They go between the
   * template's system prompt and its rendered user message, so an NPC can remember what was said.
   */
  messages: turns(["user", "assistant"]).optional(),
  /**
   * Per-call tweaks, within what the template allows: `model` must be the template's model or
   * one of its fallbacks, and `maxTokens` can only go down.
   */
  options: z
    .object({
      model: z.string().regex(MODEL_ID).max(100).optional(),
      maxTokens: z.number().int().min(1).max(4000).optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
  /** Stream the answer as Server-Sent Events (`delta`, then `done` or `error`). */
  stream: z.boolean().optional(),
});

/**
 * POST /v1/ai/complete — any prompt, any OpenRouter model, for your own servers and tools.
 * Server keys only: a client key ships inside the game, so it must stay limited to templates.
 */
export const AiCompleteSchema = z.object({
  model: z.string().regex(MODEL_ID).max(100),
  fallbackModels: z.array(z.string().regex(MODEL_ID).max(100)).max(3).default([]),
  messages: turns(["system", "user", "assistant"]).refine((m) => m.length > 0, "at least one message"),
  maxTokens: z.number().int().min(1).max(4000).default(500),
  temperature: z.number().min(0).max(2).default(0.7),
  /** Counts the call against that player's limits; defaults to "server". */
  playerId: z.string().min(1).max(64).default("server"),
  stream: z.boolean().optional(),
});

/**
 * POST /v1/ai/decide — run a server-side decision template by name (OpenRouter's Decisions API):
 * classify or score a piece of state, e.g. which kind of message a player wrote.
 */
export const AiDecideSchema = z.object({
  decision: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "snake_case"),
  /** Free text, or named fields (e.g. `{ message, to }`) the model reads as the state. */
  state: z.union([
    z.string().min(1).max(8000),
    z
      .record(z.string().min(1).max(64), z.union([z.string().max(4000), z.number(), z.boolean()]))
      .refine((o) => Object.keys(o).length >= 1 && Object.keys(o).length <= 20, "1 to 20 fields"),
  ]),
  /** Budgets and rate limits apply per player. */
  playerId: z.string().min(1).max(64),
});

const probabilities = z.record(z.string(), z.number());

/** One answer, by question type: a yes probability, a picked choice, or a score on the scale. */
export const DecisionAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: z.number() }),
  z.object({ type: z.literal("choice"), choice: z.string(), confidence: z.number(), probabilities }),
  z.object({ type: z.literal("score"), score: z.number(), confidence: z.number(), probabilities, legend: z.record(z.string(), z.string()) }),
]);

export const AiDecideResponseSchema = z.object({
  /** Keyed by question name. */
  answers: z.record(z.string(), DecisionAnswerSchema),
  model: z.string(),
  usage: z.object({ tokensIn: z.number(), tokensOut: z.number() }),
});

export const AiRunResponseSchema = z.object({
  text: z.string(),
  /** The model that answered (may be a fallback). */
  model: z.string(),
  usage: z.object({ tokensIn: z.number(), tokensOut: z.number() }),
});

export type AiRun = z.infer<typeof AiRunSchema>;
export type AiComplete = z.infer<typeof AiCompleteSchema>;
export type AiRunResponse = z.infer<typeof AiRunResponseSchema>;
export type AiDecide = z.infer<typeof AiDecideSchema>;
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>;
export type AiDecideResponse = z.infer<typeof AiDecideResponseSchema>;
