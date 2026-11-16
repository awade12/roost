import { zValidator } from "@hono/zod-validator";
import { MAX_ATTACHMENT_BYTES, PlayerReportBodySchema } from "@roost/contracts";
import { reports } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../app.ts";
import { limitBody, ONE_MB } from "../../http/body-limit.ts";
import { requireKey, type KeyVars } from "../../http/client-key.ts";
import { AppError } from "../../http/errors.ts";
import { receiveAttachment } from "./crashes.ts";

const AttachmentParams = z.object({ reportId: z.uuid(), attachmentId: z.uuid() });

/** Player bug reports from inside the game. Additive to /v1 like everything here. */
export function reportRoutes({ db, storage }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .post(
      "/reports",
      limitBody(ONE_MB),
      requireKey(db),
      zValidator("json", PlayerReportBodySchema, (result) => {
        if (!result.success) throw new AppError("bad_request", `Invalid report: ${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`);
      }),
      async (c) => {
        await reports.recordReport(db, c.get("environmentId"), c.req.valid("json"));
        return c.json({ received: 1 }, 202);
      },
    )
    .put(
      "/reports/:reportId/attachments/:attachmentId",
      limitBody(MAX_ATTACHMENT_BYTES),
      requireKey(db),
      zValidator("param", AttachmentParams, (result) => {
        if (!result.success) throw new AppError("bad_request", "Invalid attachment id");
      }),
      async (c) => {
        const { reportId, attachmentId } = c.req.valid("param");
        return c.json({ stored: await receiveAttachment(c, db, storage, reportId, attachmentId) }, 201);
      },
    );
}
