import { issueActivity, issueLabels, labels, type Db } from "@roost/db";
import { and, asc, eq, inArray } from "drizzle-orm";

export const LABEL_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export function listLabels(db: Db, gameId: string) {
  return db.select().from(labels).where(eq(labels.gameId, gameId)).orderBy(asc(labels.name));
}

/** Returns null if the game already has a label with that name. */
export async function createLabel(db: Db, gameId: string, name: string, color: LabelColor) {
  const [row] = await db.insert(labels).values({ gameId, name, color }).onConflictDoNothing().returning();
  return row ?? null;
}

export async function deleteLabel(db: Db, gameId: string, labelId: string): Promise<boolean> {
  const rows = await db.delete(labels).where(and(eq(labels.id, labelId), eq(labels.gameId, gameId))).returning({ id: labels.id });
  return rows.length > 0;
}

export async function getLabel(db: Db, labelId: string) {
  const [row] = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
  return row ?? null;
}

/** Adds or removes a label on an issue and logs it. No-op if nothing changes. */
export async function setIssueLabel(db: Db, issueId: string, label: { id: string; name: string }, on: boolean, userId: string) {
  await db.transaction(async (tx) => {
    const changed = on
      ? await tx.insert(issueLabels).values({ issueId, labelId: label.id }).onConflictDoNothing().returning()
      : await tx.delete(issueLabels).where(and(eq(issueLabels.issueId, issueId), eq(issueLabels.labelId, label.id))).returning();
    if (changed.length > 0) {
      await tx.insert(issueActivity).values({ issueId, userId, kind: on ? "labeled" : "unlabeled", data: { label: label.name } });
    }
  });
}

/** Labels for many issues at once (for the list), keyed by issue id. */
export async function labelsForIssues(db: Db, issueIds: string[]) {
  const map = new Map<string, { id: string; name: string; color: string }[]>();
  if (issueIds.length === 0) return map;
  const rows = await db
    .select({ issueId: issueLabels.issueId, id: labels.id, name: labels.name, color: labels.color })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(inArray(issueLabels.issueId, issueIds))
    .orderBy(asc(labels.name));
  for (const { issueId, ...label } of rows) map.set(issueId, [...(map.get(issueId) ?? []), label]);
  return map;
}
