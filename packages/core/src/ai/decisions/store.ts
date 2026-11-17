import { DecisionBodySchema, type DecisionBody, type DecisionQuestion } from "@roost/contracts";
import { aiDecisions, environments, type Db } from "@roost/db";
import { and, asc, eq, sql } from "drizzle-orm";
import type { UpsertResult } from "../templates/index.ts";

export type DecisionInput = DecisionBody & { name: string };
export type DecisionRow = { id: string; name: string; version: number; model: string; questions: Record<string, DecisionQuestion>; updatedAt: Date };

const QuestionsSchema = DecisionBodySchema.shape.questions;

/** Questions are validated on the way in; re-checking on the way out keeps a bad row from reaching OpenRouter. */
function toRow(row: typeof aiDecisions.$inferSelect): DecisionRow {
  const parsed = QuestionsSchema.safeParse(row.questions);
  if (!parsed.success) throw new Error(`Decision template ${row.id} has invalid questions`);
  return { id: row.id, name: row.name, version: row.version, model: row.model, questions: parsed.data, updatedAt: row.updatedAt };
}

/** The decision a game calls by name, resolved through the calling environment's game. */
export async function loadDecision(db: Db, environmentId: string, name: string): Promise<{ decision: DecisionRow; gameId: string } | null> {
  const [row] = await db
    .select({ decision: aiDecisions, gameId: environments.gameId })
    .from(environments)
    .innerJoin(aiDecisions, and(eq(aiDecisions.gameId, environments.gameId), eq(aiDecisions.name, name)))
    .where(eq(environments.id, environmentId))
    .limit(1);
  return row ? { decision: toRow(row.decision), gameId: row.gameId } : null;
}

export async function listDecisions(db: Db, gameId: string): Promise<DecisionRow[]> {
  const rows = await db.select().from(aiDecisions).where(eq(aiDecisions.gameId, gameId)).orderBy(asc(aiDecisions.name));
  return rows.map(toRow);
}

/** Deep equality ignoring key order: jsonb stores object keys in its own order. */
function sameJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)])) : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * Create or update by name, for config-as-code. An identical decision is left alone and only a
 * real change bumps the version, so pushing the same file on every CI run changes nothing.
 */
export async function upsertDecision(db: Db, gameId: string, input: DecisionInput): Promise<UpsertResult> {
  const [existing] = await db.select().from(aiDecisions).where(and(eq(aiDecisions.gameId, gameId), eq(aiDecisions.name, input.name))).limit(1);
  if (!existing) {
    await db.insert(aiDecisions).values({ gameId, name: input.name, model: input.model, questions: input.questions }).onConflictDoNothing();
    return "created";
  }
  if (existing.model === input.model && sameJson(existing.questions, input.questions)) return "unchanged";
  await db
    .update(aiDecisions)
    .set({ model: input.model, questions: input.questions, version: sql`${aiDecisions.version} + 1`, updatedAt: new Date() })
    .where(eq(aiDecisions.id, existing.id));
  return "updated";
}

export async function deleteDecisionByName(db: Db, gameId: string, name: string): Promise<boolean> {
  return (await db.delete(aiDecisions).where(and(eq(aiDecisions.gameId, gameId), eq(aiDecisions.name, name))).returning({ id: aiDecisions.id })).length > 0;
}

