import { createHash } from "node:crypto";
import { apiKeys, type Db } from "@roost/db";
import { and, eq, isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { AppError } from "./errors.ts";

export type KeyVars = { environmentId: string; keyKind: "client" | "server" };

export const KEY_HEADER = "x-roost-key";

/** Resolves the X-Roost-Key header to an environment. Keys are stored as SHA-256 hashes. */
export function requireKey(db: Db): MiddlewareHandler<{ Variables: KeyVars }> {
  return async (c, next) => {
    const raw = c.req.header(KEY_HEADER);
    if (!raw) throw new AppError("unauthorized", "Missing X-Roost-Key header");
    const hash = createHash("sha256").update(raw).digest("hex");
    const [key] = await db
      .select({ environmentId: apiKeys.environmentId, kind: apiKeys.kind })
      .from(apiKeys)
      .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
      .limit(1);
    if (!key) throw new AppError("unauthorized", "Invalid or revoked key");
    c.set("environmentId", key.environmentId);
    c.set("keyKind", key.kind);
    await next();
  };
}
