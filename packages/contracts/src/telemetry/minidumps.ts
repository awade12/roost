import { z } from "zod";
import { MAX_MINIDUMP_BYTES } from "./limits.ts";
import { CrashSchema } from "./crashes.ts";
import { ContextSchema } from "./events.ts";


/**
 * A native crash (segfault, access violation) caught by the SDK's crash monitor and sent
 * on the next launch. The dump itself goes to PUT /v1/minidumps/:id/dump; the server
 * symbolicates it and groups it into an issue like any other crash.
 */
export const MinidumpReportSchema = CrashSchema.pick({
  id: true,
  ts: true,
  playerId: true,
  tags: true,
  contexts: true,
  extra: true,
  breadcrumbs: true,
  attachments: true,
}).extend({
  sessionId: z.string().min(1).max(64).optional(),
  dumpSize: z.number().int().min(1).max(MAX_MINIDUMP_BYTES),
});

/** POST /v1/minidumps */
export const MinidumpBodySchema = z.object({ context: ContextSchema, report: MinidumpReportSchema });

export type MinidumpReport = z.infer<typeof MinidumpReportSchema>;
export type MinidumpBody = z.infer<typeof MinidumpBodySchema>;

export { MAX_MINIDUMP_BYTES };
