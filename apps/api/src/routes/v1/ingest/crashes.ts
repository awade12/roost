import { zValidator } from "@hono/zod-validator";
import { CrashBatchSchema, MAX_ATTACHMENT_BYTES } from "@roost/contracts";
import { issues, symbolication } from "@roost/core";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import type { Db } from "@roost/db";
import type { storage as storageTypes } from "@roost/core";
import { limitBody, ONE_MB } from "../../../http/body-limit.ts";
import { requireKey, type KeyVars } from "../../../http/client-key.ts";
import { AppError } from "../../../http/errors.ts";

const AttachmentParams = z.object({ crashId: z.uuid(), attachmentId: z.uuid() });
const Filename = z.string().min(1).max(128);

export function crashRoutes({ db, rateLimits, ch, storage }: AppDeps) {
  return (
    new Hono<{ Variables: KeyVars }>()
      .post(
        "/crashes",
        limitBody(ONE_MB),
        requireKey({ db, rateLimits }),
        zValidator("json", CrashBatchSchema, (result) => {
          if (!result.success)
            throw new AppError(
              "bad_request",
              `Invalid crash report: ${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`,
            );
        }),
        async (c) => {
          const batch = c.req.valid("json");
          const env = c.get("environmentId");
          // With source maps for this build, the worker maps the stacks before grouping;
          // otherwise issues would group on minified names.
          if (await symbolication.hasSourceMaps(db, c.get("gameId"), batch.context.build)) {
            for (const crash of batch.crashes) await symbolication.enqueueJs(db, env, c.get("gameId"), batch.context, crash);
            return c.json({ received: batch.crashes.length }, 202);
          }
          const received = await issues.recordCrashes(db, ch, env, batch, c.get("settings").issues.groupingFrames);
          return c.json({ received }, 202);
        },
      )
      // Raw file body (save file, log, screenshot). The name comes in X-Filename, URI-encoded.
      .put(
        "/crashes/:crashId/attachments/:attachmentId",
        limitBody(MAX_ATTACHMENT_BYTES),
        requireKey({ db, rateLimits }),
        zValidator("param", AttachmentParams, (result) => {
          if (!result.success) throw new AppError("bad_request", "Invalid attachment id");
        }),
        async (c) => {
          const { crashId, attachmentId } = c.req.valid("param");
          return c.json(
            { stored: await receiveAttachment(c, db, storage, crashId, attachmentId) },
            201,
          );
        },
      )
  );
}

/**
 * Stores a raw file body (save, log, screenshot) for a crash or player report. The name
 * comes in X-Filename, URI-encoded. Returns the stored size.
 */
export async function receiveAttachment(
  c: Context<{ Variables: KeyVars }>,
  db: Db,
  files: storageTypes.Storage,
  ownerId: string,
  attachmentId: string,
) {
  const name = Filename.safeParse(decodeURIComponent(c.req.header("x-filename") ?? ""));
  if (!name.success)
    throw new AppError("bad_request", "X-Filename header is required (max 128 chars)");
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  await issues.saveAttachment(db, files, {
    id: attachmentId,
    environmentId: c.get("environmentId"),
    crashId: ownerId,
    name: name.data,
    contentType: c.req.header("content-type")?.slice(0, 128) ?? "application/octet-stream",
    bytes,
  });
  return bytes.byteLength;
}
