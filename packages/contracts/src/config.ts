import { z } from "zod";

export const FlagTypeSchema = z.enum(["boolean", "string", "number", "json"]);

/**
 * One flag as a player sees it. `reason` and `variant` follow OpenFeature:
 * STATIC (everyone gets the default), SPLIT (rollout bucket decided), TARGETING_MATCH (a
 * per-player override).
 */
export const ResolvedFlagSchema = z.object({
  type: FlagTypeSchema,
  value: z.unknown(),
  variant: z.enum(["default", "rollout", "override"]),
  reason: z.enum(["STATIC", "SPLIT", "TARGETING_MATCH"]),
});

/** GET /v1/config?playerId=… — every flag in the environment, resolved for that player. */
export const ConfigResponseSchema = z.object({
  flags: z.record(z.string(), ResolvedFlagSchema),
  /** Changes when any flag changes; send it back as If-None-Match to get a 304. */
  version: z.string(),
});

export type FlagType = z.infer<typeof FlagTypeSchema>;
export type ResolvedFlag = z.infer<typeof ResolvedFlagSchema>;
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;
