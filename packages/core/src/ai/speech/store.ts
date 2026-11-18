import { SpeechBodySchema, type SpeechBody } from "@roost/contracts";
import { aiSpeech, environments, type Db } from "@roost/db";
import { and, asc, eq, sql } from "drizzle-orm";
import type { UpsertResult } from "../templates/index.ts";

export type SpeechInput = SpeechBody & { name: string };
export type SpeechRow = { id: string; name: string; version: number; updatedAt: Date } & SpeechBody;

/** Fields are validated on the way in; re-checking on the way out keeps a bad row from reaching OpenRouter. */
function toRow(row: typeof aiSpeech.$inferSelect): SpeechRow {
  const parsed = SpeechBodySchema.safeParse({ model: row.model, voices: row.voices, format: row.format, maxChars: row.maxChars, ...(row.instructions ? { instructions: row.instructions } : {}) });
  if (!parsed.success) throw new Error(`Speech template ${row.id} is invalid`);
  return { id: row.id, name: row.name, version: row.version, updatedAt: row.updatedAt, ...parsed.data };
}

/** The speech template a game calls by name, resolved through the calling environment's game. */
export async function loadSpeech(db: Db, environmentId: string, name: string): Promise<{ speech: SpeechRow; gameId: string } | null> {
  const [row] = await db
    .select({ speech: aiSpeech, gameId: environments.gameId })
    .from(environments)
    .innerJoin(aiSpeech, and(eq(aiSpeech.gameId, environments.gameId), eq(aiSpeech.name, name)))
    .where(eq(environments.id, environmentId))
    .limit(1);
  return row ? { speech: toRow(row.speech), gameId: row.gameId } : null;
}

export async function listSpeech(db: Db, gameId: string): Promise<SpeechRow[]> {
  const rows = await db.select().from(aiSpeech).where(eq(aiSpeech.gameId, gameId)).orderBy(asc(aiSpeech.name));
  return rows.map(toRow);
}

const same = (row: typeof aiSpeech.$inferSelect, input: SpeechInput) =>
  row.model === input.model &&
  JSON.stringify(row.voices) === JSON.stringify(input.voices) &&
  row.format === input.format &&
  row.maxChars === input.maxChars &&
  (row.instructions ?? undefined) === input.instructions;

/**
 * Create or update by name, for config-as-code. An identical template is left alone and only a
 * real change bumps the version, so pushing the same file on every CI run changes nothing.
 */
export async function upsertSpeech(db: Db, gameId: string, input: SpeechInput): Promise<UpsertResult> {
  const fields = { model: input.model, voices: input.voices, format: input.format, maxChars: input.maxChars, instructions: input.instructions ?? null };
  const [existing] = await db.select().from(aiSpeech).where(and(eq(aiSpeech.gameId, gameId), eq(aiSpeech.name, input.name))).limit(1);
  if (!existing) {
    await db.insert(aiSpeech).values({ gameId, name: input.name, ...fields }).onConflictDoNothing();
    return "created";
  }
  if (same(existing, input)) return "unchanged";
  await db
    .update(aiSpeech)
    .set({ ...fields, version: sql`${aiSpeech.version} + 1`, updatedAt: new Date() })
    .where(eq(aiSpeech.id, existing.id));
  return "updated";
}

export async function deleteSpeechByName(db: Db, gameId: string, name: string): Promise<boolean> {
  return (await db.delete(aiSpeech).where(and(eq(aiSpeech.gameId, gameId), eq(aiSpeech.name, name))).returning({ id: aiSpeech.id })).length > 0;
}
