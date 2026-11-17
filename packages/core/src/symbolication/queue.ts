import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clickhouse } from "@roost/clickhouse";
import type { Crash, CrashBatch, EventContext, MinidumpBody } from "@roost/contracts";
import { pendingCrashes, type Db } from "@roost/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { recordCrashes, saveAttachment } from "../issues/index.ts";
import { cachedGameSettings } from "../settings/index.ts";
import type { Storage } from "../storage/index.ts";
import { breakpadFor, sourceMapsFor } from "./debug-files.ts";
import { crashFromWalk, stackwalk, walkModules, writeSymbolTree } from "./minidump.ts";
import { applySourceMaps } from "./sourcemaps.ts";

export type SymbolicationDeps = { db: Db; ch: Clickhouse; storage: Storage; stackwalkBin: string };
type Row = typeof pendingCrashes.$inferSelect;

/** A native crash waits here until its dump arrives. Retries of the same id are ignored. */
export async function enqueueNative(db: Db, environmentId: string, gameId: string, body: MinidumpBody) {
  await db.insert(pendingCrashes).values({ id: body.report.id, environmentId, gameId, kind: "native", payload: body, status: "waiting" }).onConflictDoNothing();
}

/** Stores the dump and marks its crash ready. False if the report wasn't sent first. */
export async function attachDump(db: Db, storage: Storage, environmentId: string, id: string, bytes: Uint8Array): Promise<boolean> {
  const [row] = await db.select().from(pendingCrashes).where(and(eq(pendingCrashes.id, id), eq(pendingCrashes.environmentId, environmentId))).limit(1);
  if (!row) return false;
  const dumpKey = `env/${environmentId}/minidump/${id}.dmp`;
  await storage.put(dumpKey, bytes, "application/x-minidump");
  await db.update(pendingCrashes).set({ dumpKey, status: "ready" }).where(eq(pendingCrashes.id, id));
  return true;
}

/** A JS crash from a build with source maps: grouped after mapping, so issues use real file names. */
export async function enqueueJs(db: Db, environmentId: string, gameId: string, context: EventContext, crash: Crash) {
  await db.insert(pendingCrashes).values({ id: crash.id, environmentId, gameId, kind: "js", payload: { context, crash }, status: "ready" }).onConflictDoNothing();
}

async function record(deps: SymbolicationDeps, row: Row, batch: CrashBatch) {
  const frames = (await cachedGameSettings(deps.db, row.gameId)).issues.groupingFrames;
  await recordCrashes(deps.db, deps.ch, row.environmentId, batch, frames);
}

async function processJs(deps: SymbolicationDeps, row: Row) {
  const { context, crash } = row.payload as { context: EventContext; crash: Crash };
  const maps = await sourceMapsFor(deps.db, deps.storage, row.gameId, context.build);
  await record(deps, row, { context, crashes: [applySourceMaps(crash, maps)] });
}

/** Stackwalks the dump (twice if symbols match: once to list modules, once with them). */
async function walkDump(deps: SymbolicationDeps, row: Row, dir: string) {
  const file = row.dumpKey ? await deps.storage.get(row.dumpKey) : null;
  if (!file) throw new Error("dump missing from storage");
  const dumpPath = join(dir, "crash.dmp");
  await writeFile(dumpPath, file.body);
  const first = await stackwalk(deps.stackwalkBin, dumpPath);
  const matches = await breakpadFor(deps.db, row.gameId, walkModules(first));
  if (matches.length === 0) return { walk: first, dump: file.body };
  const symbols = [];
  for (const m of matches) {
    const sym = await deps.storage.get(m.storageKey);
    if (sym) symbols.push({ name: m.name, debugId: m.debugId, text: sym.body });
  }
  await writeSymbolTree(join(dir, "symbols"), symbols);
  return { walk: await stackwalk(deps.stackwalkBin, dumpPath, join(dir, "symbols")), dump: file.body };
}

async function processNative(deps: SymbolicationDeps, row: Row) {
  const { context, report } = row.payload as MinidumpBody;
  const dir = await mkdtemp(join(tmpdir(), "roost-dump-"));
  try {
    const { walk, dump } = await walkDump(deps, row, dir);
    const native = crashFromWalk(walk);
    const crash: Crash = {
      ...report,
      kind: "crash",
      level: "fatal",
      type: native.type,
      message: native.message,
      stack: native.stack,
      frames: native.frames,
      sessionId: report.sessionId ?? "native",
      tags: { ...report.tags, native: "true" },
      contexts: { ...report.contexts, native: native.native },
    };
    // The dump itself is downloadable from the issue page, like any attachment.
    await saveAttachment(deps.db, deps.storage, { id: crypto.randomUUID(), environmentId: row.environmentId, crashId: report.id, name: "minidump.dmp", contentType: "application/x-minidump", bytes: dump });
    await record(deps, row, { context, crashes: [crash] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** If processing keeps failing, the crash is still recorded, unsymbolicated, so it's never lost. */
async function recordUnprocessed(deps: SymbolicationDeps, row: Row, error: string) {
  if (row.kind === "js") {
    const { context, crash } = row.payload as { context: EventContext; crash: Crash };
    return record(deps, row, { context, crashes: [crash] });
  }
  const { context, report } = row.payload as MinidumpBody;
  const crash: Crash = { ...report, kind: "crash", level: "fatal", type: "native crash", message: `Couldn't read the minidump: ${error}`.slice(0, 2000), stack: "", sessionId: report.sessionId ?? "native", tags: { ...report.tags, native: "true" } };
  return record(deps, row, { context, crashes: [crash] });
}

const MAX_ATTEMPTS = 3;
const DUMP_WAIT_MS = 60 * 60 * 1000;

/** Claims a few ready crashes (safe with several workers), symbolicates and records them. */
export async function processPending(deps: SymbolicationDeps, limit = 10): Promise<number> {
  // Dumps that never arrived: record what we know rather than wait forever.
  await deps.db.update(pendingCrashes).set({ status: "ready", attempts: MAX_ATTEMPTS }).where(and(eq(pendingCrashes.status, "waiting"), lt(pendingCrashes.createdAt, new Date(Date.now() - DUMP_WAIT_MS))));
  const claimed = await deps.db.execute<Row>(sql`
    UPDATE pending_crashes SET status = 'processing', attempts = attempts + 1
    WHERE id IN (SELECT id FROM pending_crashes WHERE status = 'ready' ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id`);
  let done = 0;
  for (const { id } of claimed.rows) {
    const [row] = await deps.db.select().from(pendingCrashes).where(eq(pendingCrashes.id, id));
    if (!row) continue;
    try {
      if (row.attempts > MAX_ATTEMPTS) await recordUnprocessed(deps, row, row.error ?? "the dump never arrived");
      else if (row.kind === "js") await processJs(deps, row);
      else await processNative(deps, row);
      await deps.db.delete(pendingCrashes).where(eq(pendingCrashes.id, row.id));
      done += 1;
    } catch (err) {
      const error = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
      await deps.db.update(pendingCrashes).set({ status: row.attempts >= MAX_ATTEMPTS ? "failed" : "ready", error }).where(eq(pendingCrashes.id, row.id));
    }
  }
  return done;
}
