import { zValidator } from "@hono/zod-validator";
import { MAX_MINIDUMP_BYTES, MinidumpBodySchema } from "@roost/contracts";
import { symbolication } from "@roost/core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../../../app.ts";
import { limitBody, ONE_MB } from "../../../http/body-limit.ts";
import { requireKey, type KeyVars } from "../../../http/client-key.ts";
import { AppError } from "../../../http/errors.ts";

const DumpParam = z.object({ id: z.uuid() });

/**
 * Native crashes from the Rust SDK's crash monitor: the report first, then the dump.
 * Stackwalking is slow, so the worker does it and groups the crash afterwards.
 */
export function minidumpRoutes({ db, rateLimits, storage }: AppDeps) {
  return new Hono<{ Variables: KeyVars }>()
    .post(
      "/minidumps",
      limitBody(ONE_MB),
      requireKey({ db, rateLimits }),
      zValidator("json", MinidumpBodySchema, (result) => {
        if (!result.success) throw new AppError("bad_request", `Invalid minidump report: ${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`);
      }),
      async (c) => {
        await symbolication.enqueueNative(db, c.get("environmentId"), c.get("gameId"), c.req.valid("json"));
        return c.json({ received: 1 }, 202);
      },
    )
    .put(
      "/minidumps/:id/dump",
      limitBody(MAX_MINIDUMP_BYTES),
      requireKey({ db, rateLimits }),
      zValidator("param", DumpParam, (result) => {
        if (!result.success) throw new AppError("bad_request", "Invalid minidump id");
      }),
      async (c) => {
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        // "MDMP" magic: anything else would only fail later in the worker.
        if (bytes.length < 4 || String.fromCharCode(...bytes.slice(0, 4)) !== "MDMP") throw new AppError("bad_request", "Not a minidump");
        const stored = await symbolication.attachDump(db, storage, c.get("environmentId"), c.req.valid("param").id, bytes);
        if (!stored) throw new AppError("not_found", "Send the report to POST /v1/minidumps first");
        return c.json({ stored: bytes.byteLength }, 201);
      },
    );
}
