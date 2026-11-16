import { zValidator } from "@hono/zod-validator";
import { CrashBatchSchema, MAX_ATTACHMENT_BYTES } from "@roost/contracts";
import { issues } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../app.ts";
import { limitBody, ONE_MB } from "../../http/body-limit.ts";
import { requireKey, type KeyVars } from "../../http/client-key.ts";
import { AppError } from "../../http/errors.ts";

const AttachmentParams = z.object({ crashId: z.uuid(), attachmentId: z.uuid() });
const Filename = z.string().min(1).max(128);

export function crashRoutes({ db, ch, storage }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .post(
      "/crashes",
      limitBody(ONE_MB),
      requireKey(db),
      zValidator("json", CrashBatchSchema, (result) => {
        if (!result.success) throw new AppError("bad_request", `Invalid crash report: ${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`);
      }),
      async (c) => {
        const received = await issues.recordCrashes(db, ch, c.get("environmentId"), c.req.valid("json"));
        return c.json({ received }, 202);
      },
    )
    // Raw file body (save file, log, screenshot). The name comes in X-Filename, URI-encoded.
    .put(
      "/crashes/:crashId/attachments/:attachmentId",
      limitBody(MAX_ATTACHMENT_BYTES),
      requireKey(db),
      zValidator("param", AttachmentParams, (result) => {
        if (!result.success) throw new AppError("bad_request", "Invalid attachment id");
      }),
      async (c) => {
        const name = Filename.safeParse(decodeURIComponent(c.req.header("x-filename") ?? ""));
        if (!name.success) throw new AppError("bad_request", "X-Filename header is required (max 128 chars)");
        const { crashId, attachmentId } = c.req.valid("param");
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        await issues.saveAttachment(db, storage, {
          id: attachmentId,
          environmentId: c.get("environmentId"),
          crashId,
          name: name.data,
          contentType: c.req.header("content-type")?.slice(0, 128) ?? "application/octet-stream",
          bytes,
        });
        return c.json({ stored: bytes.byteLength }, 201);
      },
    );
}
