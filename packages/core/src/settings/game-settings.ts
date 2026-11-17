import { gameSettings, type Db } from "@roost/db";
import { eq } from "drizzle-orm";
import { parseSettings, type GameSettings } from "./schema.ts";

export async function getGameSettings(db: Db, gameId: string): Promise<GameSettings> {
  const [row] = await db.select({ settings: gameSettings.settings }).from(gameSettings).where(eq(gameSettings.gameId, gameId)).limit(1);
  return parseSettings(row?.settings);
}

export async function saveGameSettings(db: Db, gameId: string, settings: GameSettings, userId: string | null): Promise<GameSettings> {
  await db
    .insert(gameSettings)
    .values({ gameId, settings, updatedBy: userId })
    .onConflictDoUpdate({ target: gameSettings.gameId, set: { settings, updatedBy: userId, updatedAt: new Date() } });
  cacheFor(db).delete(gameId);
  return settings;
}

/** Settings are read on every /v1 request; a short cache keeps that off Postgres. */
const CACHE_MS = 30_000;
const caches = new WeakMap<Db, Map<string, { value: GameSettings; at: number }>>();

function cacheFor(db: Db) {
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map();
    caches.set(db, cache);
  }
  return cache;
}

/** Same as `getGameSettings`, up to 30 s stale in other processes (instant in this one after a save). */
export async function cachedGameSettings(db: Db, gameId: string, now = Date.now()): Promise<GameSettings> {
  const cache = cacheFor(db);
  const hit = cache.get(gameId);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const value = await getGameSettings(db, gameId);
  if (cache.size > 10_000) cache.clear();
  cache.set(gameId, { value, at: now });
  return value;
}
