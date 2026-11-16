import { aiTemplates, environments, games, type Db } from "@roost/db";
import { and, asc, eq, sql } from "drizzle-orm";

export type TemplateInput = {
  name: string;
  model: string;
  fallbackModels: string[];
  systemPrompt: string;
  userTemplate: string;
  maxTokens: number;
  temperature: number;
};

/** The template a game calls by name, resolved through the calling environment's game. */
export async function loadTemplate(db: Db, environmentId: string, name: string) {
  const [row] = await db
    .select({ template: aiTemplates, gameId: environments.gameId })
    .from(environments)
    .innerJoin(aiTemplates, and(eq(aiTemplates.gameId, environments.gameId), eq(aiTemplates.name, name)))
    .where(eq(environments.id, environmentId))
    .limit(1);
  return row ?? null;
}

export function listTemplates(db: Db, gameId: string) {
  return db.select().from(aiTemplates).where(eq(aiTemplates.gameId, gameId)).orderBy(asc(aiTemplates.name));
}

/** Returns null if the game already has a template with that name. */
export async function createTemplate(db: Db, gameId: string, input: TemplateInput) {
  const [row] = await db.insert(aiTemplates).values({ gameId, ...input }).onConflictDoNothing().returning();
  return row ?? null;
}

/** Saves an edit and bumps the version, so usage can be compared across prompt changes. */
export async function updateTemplate(db: Db, id: string, input: TemplateInput) {
  const [row] = await db
    .update(aiTemplates)
    .set({ ...input, version: sql`${aiTemplates.version} + 1`, updatedAt: new Date() })
    .where(eq(aiTemplates.id, id))
    .returning();
  return row ?? null;
}

export async function deleteTemplate(db: Db, id: string): Promise<boolean> {
  return (await db.delete(aiTemplates).where(eq(aiTemplates.id, id)).returning({ id: aiTemplates.id })).length > 0;
}

/** Which org owns a template (for authorization). */
export async function orgOfTemplate(db: Db, id: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: games.orgId })
    .from(aiTemplates)
    .innerJoin(games, eq(games.id, aiTemplates.gameId))
    .where(eq(aiTemplates.id, id))
    .limit(1);
  return row?.orgId ?? null;
}
