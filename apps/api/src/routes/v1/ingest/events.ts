import { zValidator } from "@hono/zod-validator";
import { EventBatchSchema } from "@roost/contracts";
import { ingest } from "@roost/core";
import { Hono } from "hono";
import type { AppDeps } from "../../../app.ts";
import { requireKey, type KeyVars } from "../../../http/client-key.ts";
import { limitBody, ONE_MB } from "../../../http/body-limit.ts";
import { AppError } from "../../../http/errors.ts";

export function eventRoutes({ db, ch }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>().post(
    "/events",
    limitBody(ONE_MB),
    requireKey(db),
    zValidator("json", EventBatchSchema, (result) => {
      if (!result.success) throw new AppError("bad_request", "Invalid event batch");
    }),
    async (c) => {
      const batch = c.req.valid("json");
      await ingest.insertBatch(ch, c.get("environmentId"), batch);
      return c.json({ received: batch.events.length }, 202);
    },
  );
}
