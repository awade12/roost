import { environments, gameSettings, issueActivity, issues, type Db } from "@roost/db";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { parseSettings } from "../../settings/index.ts";

/**
 * Resolves issues that have been quiet for the game's `autoResolveDays`. If one comes
 * back it reopens as a regression, like a manual resolve. Returns how many were resolved.
 */
export async function autoResolve(db: Db, now = new Date()): Promise<number> {
  const rows = await db.select().from(gameSettings);
  let resolved = 0;
  for (const row of rows) {
    const days = parseSettings(row.settings).issues.autoResolveDays;
    if (days > 0) resolved += await resolveQuiet(db, row.gameId, new Date(now.getTime() - days * 86_400_000), days);
  }
  return resolved;
}

async function resolveQuiet(db: Db, gameId: string, before: Date, days: number): Promise<number> {
  return db.transaction(async (tx) => {
    const envIds = tx.select({ id: environments.id }).from(environments).where(eq(environments.gameId, gameId));
    const done = await tx
      .update(issues)
      .set({ status: "resolved", resolvedAt: sql`now()`, regressedAt: null })
      .where(and(inArray(issues.environmentId, envIds), eq(issues.status, "unresolved"), lt(issues.lastSeenAt, before)))
      .returning({ id: issues.id });
    if (done.length) {
      const data = { from: "unresolved", to: "resolved", reason: "auto", days };
      await tx.insert(issueActivity).values(done.map((i) => ({ issueId: i.id, kind: "status" as const, data })));
    }
    return done.length;
  });
}
