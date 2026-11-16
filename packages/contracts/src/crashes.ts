import { z } from "zod";
import { ContextSchema } from "./events.ts";

/** Most crash reports carry this many recent events, so the dashboard can show what led up to it. */
export const MAX_BREADCRUMBS = 100;
/** Per-attachment and per-report limits. Uploads past these are rejected. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

const jsonSize = (max: number) => (value: unknown) => JSON.stringify(value).length <= max;
const Json = z.record(z.string().max(64), z.unknown());

export const StackFrameSchema = z.object({
  function: z.string().max(256).optional(),
  file: z.string().max(512).optional(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  /** Frame is in the game's own code (vs the engine or a library). Drives grouping. */
  inApp: z.boolean().optional(),
});

export const BreadcrumbSchema = z.object({
  name: z.string().max(64),
  ts: z.iso.datetime({ offset: true }),
  props: z.record(z.string().max(64), z.union([z.string().max(256), z.number(), z.boolean(), z.null()])).optional(),
  /** For custom breadcrumbs: what kind of thing happened ("ui", "network", "save"…). */
  category: z.string().max(32).optional(),
  level: z.enum(["debug", "info", "warning", "error"]).optional(),
  message: z.string().max(512).optional(),
});

/** Declared on the report; the bytes are uploaded separately to /v1/crashes/:id/attachments/:attachmentId. */
export const AttachmentRefSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(128),
  contentType: z.string().max(128),
  size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
});

export const CrashSchema = z.object({
  /** Client-generated UUID; retries with the same id are stored once. */
  id: z.uuid(),
  /**
   * "crash" ended the app (panic, fatal JS error); "error" was caught and
   * reported; "message" is a report without an exception (captureMessage).
   */
  kind: z.enum(["crash", "error", "message"]),
  /** How bad it is. Defaults from `kind` when omitted. */
  level: z.enum(["fatal", "error", "warning", "info"]).optional(),
  /** Exception type, e.g. "TypeError" or "panic". */
  type: z.string().min(1).max(128),
  message: z.string().max(2000),
  /** Raw stack text as the runtime printed it. Used for grouping when `frames` is missing. */
  stack: z.string().max(32_000).default(""),
  /** Parsed frames, innermost first. Optional; better grouping when present. */
  frames: z.array(StackFrameSchema).max(100).optional(),
  ts: z.iso.datetime({ offset: true }),
  sessionId: z.string().min(1).max(64),
  playerId: z.string().min(1).max(64),
  breadcrumbs: z.array(BreadcrumbSchema).max(MAX_BREADCRUMBS).default([]),
  /** Searchable key/values, e.g. { level_id: "forest-3", mode: "ranked" }. */
  tags: z
    .record(z.string().max(32).regex(/^[a-zA-Z0-9_.:-]+$/), z.string().max(200))
    .refine((t) => Object.keys(t).length <= 50, "at most 50 tags")
    .default({}),
  /** Structured blocks shown on the event, e.g. { match: { round: 3, opponent: "bot" } }. */
  contexts: z.record(z.string().max(32), Json).refine(jsonSize(32_000), "contexts over 32 KB").default({}),
  /** Anything else worth seeing. JSON, up to 64 KB. Put big things (save files) in attachments. */
  extra: Json.refine(jsonSize(64_000), "extra over 64 KB").default({}),
  /** Overrides grouping: reports with the same fingerprint become one issue. */
  fingerprint: z.array(z.string().max(128)).min(1).max(5).optional(),
  attachments: z.array(AttachmentRefSchema).max(MAX_ATTACHMENTS).default([]),
});

/** POST /v1/crashes — usually sent on the next launch after a fatal crash. */
export const CrashBatchSchema = z.object({
  context: ContextSchema,
  crashes: z.array(CrashSchema).min(1).max(20),
});

export type Crash = z.infer<typeof CrashSchema>;
export type CrashBatch = z.infer<typeof CrashBatchSchema>;
export type StackFrame = z.infer<typeof StackFrameSchema>;
export type Breadcrumb = z.infer<typeof BreadcrumbSchema>;
export type AttachmentRef = z.infer<typeof AttachmentRefSchema>;
