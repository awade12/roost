import { environments, flags, games, type Db } from "@roost/db";
import { and, asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { resolveFlag, sameJson, type FlagRow } from "./evaluate.ts";

export type FlagInput = Omit<FlagRow, "key"> & { description: string };

export function listFlags(db: Db, environmentId: string) {
  return db.select().from(flags).where(eq(flags.environmentId, environmentId)).orderBy(asc(flags.key));
}

export async function createFlag(db: Db, environmentId: string, key: string, input: FlagInput, userId: string) {
  const [row] = await db.insert(flags).values({ environmentId, key, ...input, updatedBy: userId }).onConflictDoNothing().returning();
  return row ?? null;
}

/** The key and type never change: games already read them by key, as that type. */
export async function updateFlag(db: Db, flagId: string, input: Omit<FlagInput, "type">, userId: string | null) {
  const [row] = await db
    .update(flags)
    .set({ description: input.description, value: input.value, rollout: input.rollout, overrides: input.overrides, updatedBy: userId, updatedAt: new Date() })
    .where(eq(flags.id, flagId))
    .returning();
  return row ?? null;
}

export async function deleteFlag(db: Db, flagId: string) {
  await db.delete(flags).where(eq(flags.id, flagId));
}

export async function flagById(db: Db, flagId: string) {
  const [row] = await db.select({ flag: flags, orgId: games.orgId }).from(flags).innerJoin(environments, eq(environments.id, flags.environmentId)).innerJoin(games, eq(games.id, environments.gameId)).where(eq(flags.id, flagId)).limit(1);
  return row ?? null;
}

/**
 * Every flag resolved for one player, plus a version that changes whenever any flag changes
 * (or one is added or removed), for ETag caching.
 */
export async function configFor(db: Db, environmentId: string, playerId: string) {
  const rows = await db.select().from(flags).where(and(eq(flags.environmentId, environmentId)));
  const version = createHash("sha256")
    .update(rows.map((r) => `${r.id}:${r.updatedAt.getTime()}`).sort().join(","))
    .digest("hex")
    .slice(0, 16);
  const resolved = Object.fromEntries(rows.map((r) => [r.key, resolveFlag({ key: r.key, type: r.type, value: r.value, rollout: r.rollout ?? null, overrides: r.overrides }, playerId)]));
  return { flags: resolved, version };
}

export type FlagUpsert = "created" | "updated" | "unchanged" | "type_conflict";

/**
 * Create or update by key, for config-as-code. The type can't change: games already read the
 * flag as that type, so changing it means deleting and recreating the flag on purpose.
 */
export async function upsertFlag(db: Db, environmentId: string, key: string, input: FlagInput, userId: string | null): Promise<FlagUpsert> {
  const [existing] = await db.select().from(flags).where(and(eq(flags.environmentId, environmentId), eq(flags.key, key))).limit(1);
  if (!existing) {
    await db.insert(flags).values({ environmentId, key, ...input, updatedBy: userId }).onConflictDoNothing();
    return "created";
  }
  if (existing.type !== input.type) return "type_conflict";
  const same =
    existing.description === input.description &&
    sameJson(existing.value, input.value) &&
    sameJson(existing.rollout ?? null, input.rollout) &&
    sameJson(existing.overrides, input.overrides);
  if (same) return "unchanged";
  await db
    .update(flags)
    .set({ description: input.description, value: input.value, rollout: input.rollout, overrides: input.overrides, updatedBy: userId, updatedAt: new Date() })
    .where(eq(flags.id, existing.id));
  return "updated";
}

export async function deleteFlagByKey(db: Db, environmentId: string, key: string): Promise<boolean> {
  return (await db.delete(flags).where(and(eq(flags.environmentId, environmentId), eq(flags.key, key))).returning({ id: flags.id })).length > 0;
}
