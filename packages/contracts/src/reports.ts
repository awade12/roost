import { z } from "zod";
import { AttachmentRefSchema, BreadcrumbSchema, MAX_ATTACHMENTS } from "./telemetry/crashes.ts";
import { ContextSchema } from "./telemetry/events.ts";

const Json = z.record(z.string().max(64), z.unknown());
const jsonSize = (max: number) => (value: unknown) => JSON.stringify(value).length <= max;

/**
 * A bug report a player writes from inside the game ("Report a bug"). Screenshots and
 * save files go up as attachments to /v1/reports/:id/attachments/:attachmentId.
 */
export const PlayerReportSchema = z.object({
  /** Client-generated UUID; retries with the same id are stored once. */
  id: z.uuid(),
  ts: z.iso.datetime({ offset: true }),
  playerId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64).optional(),
  category: z.enum(["bug", "feedback", "crash", "other"]).default("bug"),
  /** What the player wrote. */
  message: z.string().trim().min(1).max(4000),
  /** Only if the player chose to share it, so the studio can reply. */
  email: z.email().max(254).optional(),
  tags: z
    .record(z.string().max(32).regex(/^[a-zA-Z0-9_.:-]+$/), z.string().max(200))
    .refine((t) => Object.keys(t).length <= 50, "at most 50 tags")
    .default({}),
  contexts: z.record(z.string().max(32), Json).refine(jsonSize(32_000), "contexts over 32 KB").default({}),
  extra: Json.refine(jsonSize(64_000), "extra over 64 KB").default({}),
  /** What the player did just before, same shape as crash breadcrumbs. */
  breadcrumbs: z.array(BreadcrumbSchema).max(100).default([]),
  attachments: z.array(AttachmentRefSchema).max(MAX_ATTACHMENTS).default([]),
});

/** POST /v1/reports */
export const PlayerReportBodySchema = z.object({
  context: ContextSchema,
  report: PlayerReportSchema,
});

export type PlayerReport = z.infer<typeof PlayerReportSchema>;
export type PlayerReportBody = z.infer<typeof PlayerReportBodySchema>;
