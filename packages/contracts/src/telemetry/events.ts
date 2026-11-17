import { z } from "zod";
import { MAX_EVENTS_PER_BATCH } from "./limits.ts";

/** Limits for one POST /v1/events call. Changing these is a /v1 contract change. */

const propValue = z.union([z.string().max(1024), z.number(), z.boolean(), z.null()]);

export const EventSchema = z.object({
  /** Client-generated UUID; makes retries safe (duplicates are dropped). */
  id: z.uuid(),
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "snake_case"),
  /** When it happened on the device (ISO 8601). */
  ts: z.iso.datetime({ offset: true }),
  sessionId: z.string().min(1).max(64),
  playerId: z.string().min(1).max(64),
  value: z.number().optional(),
  props: z.record(z.string().max(64), propValue).optional(),
});

export const ContextSchema = z.object({
  build: z.string().min(1).max(64),
  platform: z.enum(["ios", "android", "web", "windows", "macos", "linux"]),
  osVersion: z.string().max(64).optional(),
  deviceModel: z.string().max(128).optional(),
  locale: z.string().max(32).optional(),
  sdk: z.string().max(64),
});

export const EventBatchSchema = z.object({
  context: ContextSchema,
  events: z.array(EventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export type RoostEvent = z.infer<typeof EventSchema>;
export type EventContext = z.infer<typeof ContextSchema>;
export type EventBatch = z.infer<typeof EventBatchSchema>;

export { MAX_EVENTS_PER_BATCH };
