import { apiKeys, environments, games, memberships, type Db } from "@roost/db";
import { and, eq } from "drizzle-orm";

export type Role = "owner" | "dev" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, dev: 1, owner: 2 };

/** Does `role` meet the minimum `need`? owner > dev > viewer. */
export function hasRole(role: Role, need: Role): boolean {
  return RANK[role] >= RANK[need];
}

/** The user's role in an org, or null if they are not a member. */
export async function roleIn(db: Db, userId: string, orgId: string): Promise<Role | null> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  return row?.role ?? null;
}

/** Which org owns this environment. Used to authorize environment-scoped routes. */
export async function orgOfEnvironment(db: Db, environmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: games.orgId })
    .from(environments)
    .innerJoin(games, eq(games.id, environments.gameId))
    .where(eq(environments.id, environmentId))
    .limit(1);
  return row?.orgId ?? null;
}

/** Which org owns this game. */
export async function orgOfGame(db: Db, gameId: string): Promise<string | null> {
  const [row] = await db.select({ orgId: games.orgId }).from(games).where(eq(games.id, gameId)).limit(1);
  return row?.orgId ?? null;
}

/** Which org owns this API key. */
export async function orgOfKey(db: Db, keyId: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: games.orgId })
    .from(apiKeys)
    .innerJoin(environments, eq(environments.id, apiKeys.environmentId))
    .innerJoin(games, eq(games.id, environments.gameId))
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  return row?.orgId ?? null;
}
