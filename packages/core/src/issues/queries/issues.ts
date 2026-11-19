import { environments, games, issueActivity, issues, type Db } from "@roost/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export type IssueStatus = "unresolved" | "resolved" | "ignored";

export function listIssues(db: Db, environmentId: string, status: IssueStatus) {
  return db
    .select()
    .from(issues)
    .where(and(eq(issues.environmentId, environmentId), eq(issues.status, status)))
    .orderBy(desc(issues.lastSeenAt))
    .limit(200);
}

/** An issue by its short per-environment number (#142), as people refer to them. */
export async function issueByNumber(db: Db, environmentId: string, number: number) {
  const [row] = await db.select().from(issues).where(and(eq(issues.environmentId, environmentId), eq(issues.number, number))).limit(1);
  return row ?? null;
}

export async function getIssue(db: Db, id: string) {
  const [row] = await db.select().from(issues).where(eq(issues.id, id)).limit(1);
  return row ?? null;
}

/**
 * Resolving clears the regression flag; reopening clears the resolved time. Logged to activity.
 * `userId` is null when a server key made the change; `via` says what did (e.g. "mcp").
 */
export async function setIssueStatus(db: Db, id: string, status: IssueStatus, userId: string | null, via?: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ status: issues.status }).from(issues).where(eq(issues.id, id));
    const [row] = await tx
      .update(issues)
      .set({ status, resolvedAt: status === "resolved" ? new Date() : null, ...(status === "resolved" ? { regressedAt: null } : {}) })
      .where(eq(issues.id, id))
      .returning();
    if (row && before?.status !== status) {
      await tx.insert(issueActivity).values({ issueId: id, userId, kind: "status", data: { from: before?.status, to: status, ...(via ? { via } : {}) } });
    }
    return row ?? null;
  });
}

export async function assignIssue(db: Db, id: string, assigneeId: string | null, userId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(issues).set({ assigneeId }).where(eq(issues.id, id)).returning();
    await tx.insert(issueActivity).values({ issueId: id, userId, kind: "assigned", data: { to: assigneeId } });
    return row ?? null;
  });
}

export async function linkLinear(db: Db, id: string, link: { identifier: string; url: string }, userId: string) {
  await db.transaction(async (tx) => {
    await tx.update(issues).set({ linearIdentifier: link.identifier, linearUrl: link.url }).where(eq(issues.id, id));
    await tx.insert(issueActivity).values({ issueId: id, userId, kind: "linear", data: link });
  });
}

/** The org and game an issue belongs to (authorization, labels, integrations). */
export async function ownerOfIssue(db: Db, id: string): Promise<{ orgId: string; gameId: string } | null> {
  const [row] = await db
    .select({ orgId: games.orgId, gameId: games.id })
    .from(issues)
    .innerJoin(environments, eq(environments.id, issues.environmentId))
    .innerJoin(games, eq(games.id, environments.gameId))
    .where(eq(issues.id, id))
    .limit(1);
  return row ?? null;
}

const NEW_FOR_MS = 7 * 86_400_000;

/**
 * For the sidebar badge: unresolved issues that regressed, and ones first seen in the
 * last 7 days (not counting regressed ones twice).
 */
export async function issueBadgeCounts(db: Db, environmentId: string, now = new Date()) {
  const since = new Date(now.getTime() - NEW_FOR_MS);
  const [row] = await db
    .select({
      regressed: sql<number>`count(*) filter (where ${issues.regressedAt} is not null)`,
      fresh: sql<number>`count(*) filter (where ${issues.regressedAt} is null and ${issues.firstSeenAt} >= ${since})`,
    })
    .from(issues)
    .where(and(eq(issues.environmentId, environmentId), eq(issues.status, "unresolved")));
  return { regressed: Number(row?.regressed ?? 0), new: Number(row?.fresh ?? 0) };
}

/** Issue numbers by id, for linking crash rows to their issue. */
export async function issueNumbers(db: Db, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: issues.id, number: issues.number }).from(issues).where(inArray(issues.id, ids));
  return new Map(rows.map((r) => [r.id, r.number]));
}
