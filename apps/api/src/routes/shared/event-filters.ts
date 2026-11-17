import { z } from "zod";

/** Time ranges the event explorer and /v1/query accept, in hours. */
export const HOURS = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 } as const;
export const Range = z.enum(["1h", "24h", "7d", "30d"]).default("24h");
const text = (max: number) => z.string().trim().min(1).max(max).optional();

/** Query-string filters for the event stream and its chart, shared by /admin and /v1/query. */
export const EventFilters = z
  .object({
    range: Range,
    name: text(64),
    player: text(64),
    build: text(64),
    platform: text(16),
    propKey: text(64),
    propValue: z.string().max(1024).optional(),
    before: z.iso.datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?$/)).optional(),
    beforeId: z.uuid().optional(),
  })
  .transform((q) => ({
    filters: {
      hours: HOURS[q.range],
      name: q.name,
      playerId: q.player,
      build: q.build,
      platform: q.platform,
      prop: q.propKey && q.propValue !== undefined ? { key: q.propKey, value: q.propValue } : undefined,
    },
    before: q.before && q.beforeId ? { at: q.before, id: q.beforeId } : undefined,
  }));

