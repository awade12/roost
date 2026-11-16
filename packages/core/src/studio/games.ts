import { apiKeys, environments, games, type Db } from "@roost/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

/** Every new game starts with these environments. */
export const DEFAULT_ENVIRONMENTS = ["production", "development"] as const;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Creates a game with its default environments. Returns null if the slug is taken in this org. */
export async function createGame(db: Db, orgId: string, name: string) {
  const slug = slugify(name) || "game";
  return db.transaction(async (tx) => {
    const [game] = await tx
      .insert(games)
      .values({ orgId, name, slug })
      .onConflictDoNothing()
      .returning({ id: games.id, name: games.name, slug: games.slug });
    if (!game) return null;
    await tx.insert(environments).values(DEFAULT_ENVIRONMENTS.map((env) => ({ gameId: game.id, name: env })));
    return game;
  });
}

export type GameSummary = {
  id: string;
  name: string;
  slug: string;
  environments: {
    id: string;
    name: string;
    keys: { id: string; kind: "client" | "server"; prefix: string; createdAt: Date }[];
  }[];
};

/** All games in an org with their environments and active (unrevoked) keys. */
export async function listGames(db: Db, orgId: string): Promise<GameSummary[]> {
  const gameRows = await db
    .select({ id: games.id, name: games.name, slug: games.slug })
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(asc(games.name));
  if (gameRows.length === 0) return [];

  const envRows = await db
    .select({ id: environments.id, name: environments.name, gameId: environments.gameId })
    .from(environments)
    .where(inArray(environments.gameId, gameRows.map((g) => g.id)))
    .orderBy(asc(environments.name));
  const keyRows = envRows.length
    ? await db
        .select({
          id: apiKeys.id,
          kind: apiKeys.kind,
          prefix: apiKeys.prefix,
          createdAt: apiKeys.createdAt,
          environmentId: apiKeys.environmentId,
        })
        .from(apiKeys)
        .where(and(inArray(apiKeys.environmentId, envRows.map((e) => e.id)), isNull(apiKeys.revokedAt)))
        .orderBy(asc(apiKeys.createdAt))
    : [];

  return gameRows.map((game) => ({
    ...game,
    environments: envRows
      .filter((env) => env.gameId === game.id)
      .map((env) => ({
        id: env.id,
        name: env.name,
        keys: keyRows
          .filter((k) => k.environmentId === env.id)
          .map(({ environmentId: _env, ...key }) => key),
      })),
  }));
}
