import type { Clickhouse } from "@roost/clickhouse";
import type { Crash, CrashBatch, EventContext } from "@roost/contracts";
import { issueActivity, issues, type Db } from "@roost/db";
import { and, eq, sql } from "drizzle-orm";
import { culprit, fingerprint } from "./fingerprint.ts";

const chTime = (iso: string) => new Date(iso).toISOString().replace("T", " ").replace("Z", "");
const DEFAULT_LEVEL = { crash: "fatal", error: "error", message: "info" } as const;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Updates an existing issue; a resolved one that happens again (after the fix) reopens as regressed. */
async function touch(tx: Tx, existing: typeof issues.$inferSelect, at: Date, build: string) {
  const regressed = existing.status === "resolved" && at > (existing.resolvedAt ?? at);
  await tx
    .update(issues)
    .set({
      lastSeenAt: at > existing.lastSeenAt ? at : existing.lastSeenAt,
      lastBuild: build,
      ...(regressed ? { status: "unresolved" as const, regressedAt: new Date(), resolvedAt: null } : {}),
    })
    .where(eq(issues.id, existing.id));
  if (regressed) {
    await tx.insert(issueActivity).values({ issueId: existing.id, kind: "status", data: { from: "resolved", to: "unresolved", reason: "regression", build } });
  }
}

async function upsertIssue(db: Db, environmentId: string, crash: Crash, context: EventContext): Promise<string> {
  const fp = fingerprint(crash);
  const at = new Date(crash.ts);
  return db.transaction(async (tx) => {
    // Serializes issue creation per environment so issue numbers don't collide.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${environmentId}))`);
    const [existing] = await tx
      .select()
      .from(issues)
      .where(and(eq(issues.environmentId, environmentId), eq(issues.fingerprint, fp)))
      .limit(1);
    if (existing) {
      await touch(tx, existing, at, context.build);
      return existing.id;
    }
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${issues.number}), 0) + 1` })
      .from(issues)
      .where(eq(issues.environmentId, environmentId));
    const [created] = await tx
      .insert(issues)
      .values({
        environmentId,
        number: Number(next),
        fingerprint: fp,
        kind: crash.kind,
        type: crash.type,
        message: crash.message.slice(0, 500),
        culprit: culprit(crash),
        firstSeenAt: at,
        lastSeenAt: at,
        firstBuild: context.build,
        lastBuild: context.build,
      })
      .returning({ id: issues.id });
    if (!created) throw new Error("issue insert returned no row");
    return created.id;
  });
}

function row(environmentId: string, issueId: string, crash: Crash, context: EventContext) {
  return {
    id: crash.id,
    environment_id: environmentId,
    issue_id: issueId,
    player_id: crash.playerId,
    session_id: crash.sessionId,
    build: context.build,
    platform: context.platform,
    os_version: context.osVersion ?? "",
    device_model: context.deviceModel ?? "",
    kind: crash.kind,
    level: crash.level ?? DEFAULT_LEVEL[crash.kind],
    type: crash.type,
    message: crash.message,
    stack: crash.stack,
    breadcrumbs: JSON.stringify(crash.breadcrumbs),
    tags: crash.tags,
    contexts: JSON.stringify(crash.contexts),
    extra: JSON.stringify(crash.extra),
    attachments: crash.attachments.length,
    occurred_at: chTime(crash.ts),
  };
}

/** Groups each report into an issue and stores it. Returns how many were stored. */
export async function recordCrashes(db: Db, ch: Clickhouse, environmentId: string, batch: CrashBatch): Promise<number> {
  const rows = [];
  for (const crash of batch.crashes) {
    rows.push(row(environmentId, await upsertIssue(db, environmentId, crash, batch.context), crash, batch.context));
  }
  await ch.insert({ table: "crash_events", values: rows, format: "JSONEachRow" });
  return rows.length;
}
