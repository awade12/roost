import { z } from "zod";

/**
 * Everything a studio can tune per game without a deploy. Defaults live here, so a
 * game with no saved row (or an older row missing a newer field) still gets a full,
 * valid object. Add fields with a default; never repurpose one.
 */
export const GameSettingsSchema = z.object({
  api: z
    .object({
      /** Off pauses every /v1 call for this game (events, crashes, AI): builds get 403 and drop data. */
      enabled: z.boolean().default(true),
      /** Per API key. Each SDK batches, so one player sends a few requests a minute at most. */
      requestsPerMinute: z.number().int().min(10).max(100_000).default(120),
    })
    .prefault({}),
  issues: z
    .object({
      /** In-app frames that identify an issue. Changing it splits or merges future reports into new issues. */
      groupingFrames: z.number().int().min(1).max(10).default(3),
      /** Resolve issues with no new events for this many days. 0 = never. */
      autoResolveDays: z.number().int().min(0).max(365).default(0),
    })
    .prefault({}),
});

export type GameSettings = z.infer<typeof GameSettingsSchema>;

export const DEFAULT_SETTINGS: GameSettings = GameSettingsSchema.parse({});

/** Stored JSON → settings. Anything unreadable falls back to defaults rather than breaking ingest. */
export function parseSettings(stored: unknown): GameSettings {
  const parsed = GameSettingsSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
