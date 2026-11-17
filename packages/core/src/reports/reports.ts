import type { PlayerReportBody } from "@roost/contracts";
import { environments, games, issues, playerReports, type Db } from "@roost/db";
import { and, count, desc, eq } from "drizzle-orm";

export type ReportStatus = "open" | "closed";

/** Stores a player's report. Returns false if this id was already stored (a retry). */
export async function recordReport(db: Db, environmentId: string, { context, report }: PlayerReportBody): Promise<boolean> {
  const rows = await db
    .insert(playerReports)
    .values({
      id: report.id,
      environmentId,
      playerId: report.playerId,
      sessionId: report.sessionId ?? null,
      category: report.category,
      message: report.message,
      email: report.email ?? null,
      build: context.build,
      platform: context.platform,
      osVersion: context.osVersion ?? null,
      deviceModel: context.deviceModel ?? null,
      tags: report.tags,
      contexts: report.contexts,
      extra: report.extra,
      breadcrumbs: report.breadcrumbs,
      attachmentCount: report.attachments.length,
      reportedAt: new Date(report.ts),
    })
    .onConflictDoNothing()
    .returning({ id: playerReports.id });
  return rows.length > 0;
}

/** Newest first, without the heavy JSON columns. */
export function listReports(db: Db, environmentId: string, status: ReportStatus, limit = 200) {
  return db
    .select({
      id: playerReports.id,
      category: playerReports.category,
      message: playerReports.message,
      playerId: playerReports.playerId,
      hasEmail: playerReports.email,
      build: playerReports.build,
      platform: playerReports.platform,
      attachmentCount: playerReports.attachmentCount,
      issueId: playerReports.issueId,
      receivedAt: playerReports.receivedAt,
    })
    .from(playerReports)
    .where(and(eq(playerReports.environmentId, environmentId), eq(playerReports.status, status)))
    .orderBy(desc(playerReports.receivedAt))
    .limit(limit)
    .then((rows) => rows.map(({ hasEmail, ...r }) => ({ ...r, hasEmail: hasEmail !== null })));
}

export async function getReport(db: Db, id: string) {
  const [row] = await db
    .select({ report: playerReports, issueNumber: issues.number })
    .from(playerReports)
    .leftJoin(issues, eq(issues.id, playerReports.issueId))
    .where(eq(playerReports.id, id))
    .limit(1);
  return row ? { ...row.report, issueNumber: row.issueNumber } : null;
}

export async function setReportStatus(db: Db, id: string, status: ReportStatus) {
  await db.update(playerReports).set({ status }).where(eq(playerReports.id, id));
}

/** Links a report to an issue in the same environment, or unlinks with null. Returns false if the issue is elsewhere. */
export async function linkReportIssue(db: Db, id: string, issueId: string | null): Promise<boolean> {
  if (issueId) {
    const [match] = await db
      .select({ id: issues.id })
      .from(issues)
      .innerJoin(playerReports, eq(playerReports.environmentId, issues.environmentId))
      .where(and(eq(issues.id, issueId), eq(playerReports.id, id)))
      .limit(1);
    if (!match) return false;
  }
  await db.update(playerReports).set({ issueId }).where(eq(playerReports.id, id));
  return true;
}

/** For access checks: the org that owns a report. */
export async function orgOfReport(db: Db, id: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: games.orgId })
    .from(playerReports)
    .innerJoin(environments, eq(environments.id, playerReports.environmentId))
    .innerJoin(games, eq(games.id, environments.gameId))
    .where(eq(playerReports.id, id))
    .limit(1);
  return row?.orgId ?? null;
}

/** For the sidebar badge. */
export async function openReportCount(db: Db, environmentId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(playerReports)
    .where(and(eq(playerReports.environmentId, environmentId), eq(playerReports.status, "open")));
  return row?.n ?? 0;
}

/** A player's reports in one environment, newest first. */
export function reportsForPlayer(db: Db, environmentId: string, playerId: string) {
  return db
    .select({ id: playerReports.id, category: playerReports.category, message: playerReports.message, status: playerReports.status, receivedAt: playerReports.receivedAt })
    .from(playerReports)
    .where(and(eq(playerReports.environmentId, environmentId), eq(playerReports.playerId, playerId)))
    .orderBy(desc(playerReports.receivedAt))
    .limit(50);
}
