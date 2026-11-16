import { z } from "zod";

/** POST /v1/ai/run — run a server-side prompt template by name. */
export const AiRunSchema = z.object({
  template: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "snake_case"),
  /** Values for the template's {{placeholders}}. */
  vars: z.record(z.string().max(64), z.union([z.string().max(4000), z.number(), z.boolean()])).default({}),
  /** Budgets and rate limits apply per player. */
  playerId: z.string().min(1).max(64),
});

export const AiRunResponseSchema = z.object({
  text: z.string(),
  /** The model that answered (may be a fallback). */
  model: z.string(),
  usage: z.object({ tokensIn: z.number(), tokensOut: z.number() }),
});

export type AiRun = z.infer<typeof AiRunSchema>;
export type AiRunResponse = z.infer<typeof AiRunResponseSchema>;
