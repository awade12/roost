import { createHash } from "node:crypto";
import { settings } from "@roost/core";
import { apiKeys, environments, type Db } from "@roost/db";
import { and, eq, isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { AppError } from "./errors.ts";
import { createLimiter } from "./rate-limit.ts";

export type KeyVars = {
  environmentId: string;
  gameId: string;
  keyKind: "client" | "server";
  settings: settings.GameSettings;
};

export const KEY_HEADER = "x-roost-key";

type Resolved = { environmentId: string; gameId: string; kind: "client" | "server" } | null;

/**
 * Key lookups are cached briefly (unknown keys too, so a flood of bad keys can't hammer
 * Postgres). A revoked key stops working within this window; `forgetKeys` makes it instant here.
 */
const KEY_CACHE_MS = 30_000;
const keyCache = new Map<string, { value: Resolved; at: number }>();
const limiter = createLimiter({ limit: settings.DEFAULT_SETTINGS.api.requestsPerMinute, windowMs: 60_000 });

export function forgetKeys(): void {
  keyCache.clear();
}

async function resolve(db: Db, hash: string): Promise<Resolved> {
  const hit = keyCache.get(hash);
  if (hit && Date.now() - hit.at < KEY_CACHE_MS) return hit.value;
  const [row] = await db
    .select({ environmentId: apiKeys.environmentId, gameId: environments.gameId, kind: apiKeys.kind })
    .from(apiKeys)
    .innerJoin(environments, eq(environments.id, apiKeys.environmentId))
    .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (keyCache.size > 50_000) keyCache.clear();
  keyCache.set(hash, { value: row ?? null, at: Date.now() });
  return row ?? null;
}

/**
 * Resolves X-Roost-Key to an environment and its game's settings, then applies the
 * game's switches: the API can be paused, and each key gets the game's per-minute limit.
 */
export function requireKey(db: Db): MiddlewareHandler<{ Variables: KeyVars }> {
  return async (c, next) => {
    const raw = c.req.header(KEY_HEADER);
    if (!raw) throw new AppError("unauthorized", "Missing X-Roost-Key header");
    const hash = createHash("sha256").update(raw).digest("hex");
    const key = await resolve(db, hash);
    if (!key) throw new AppError("unauthorized", "Invalid or revoked key");
    const game = await settings.cachedGameSettings(db, key.gameId);
    if (!game.api.enabled) throw new AppError("forbidden", "The API is paused for this game");
    limiter.hit(hash, game.api.requestsPerMinute);
    c.set("environmentId", key.environmentId);
    c.set("gameId", key.gameId);
    c.set("keyKind", key.kind);
    c.set("settings", game);
    await next();
  };
}

/**
 * After requireKey: only server keys (`rk_server_…`) pass. They never ship in a game build, so
 * they can manage templates and flags, upload debug files, and read data.
 */
export function requireServerKey(): MiddlewareHandler<{ Variables: KeyVars }> {
  return async (c, next) => {
    if (c.get("keyKind") !== "server") throw new AppError("forbidden", "This needs a server key (rk_server_…), not a client key");
    await next();
  };
}

/** True if `raw` is an unrevoked client or server key of any game (cached like requireKey). */
export async function isValidKey(db: Db, raw: string): Promise<boolean> {
  if (!raw.startsWith("rk_")) return false;
  return (await resolve(db, createHash("sha256").update(raw).digest("hex"))) !== null;
}
