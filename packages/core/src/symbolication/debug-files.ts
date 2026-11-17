import { debugFiles, type Db } from "@roost/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Storage } from "../storage/index.ts";

export type DebugFileKind = "breakpad" | "sourcemap";

/**
 * Reads `MODULE <os> <arch> <debug id> <name>` from a Breakpad .sym file's first line.
 * The name is the module's debug file (e.g. game.pdb on Windows, game elsewhere).
 */
export function breakpadHeader(text: string): { debugId: string; name: string } | null {
  const first = text.slice(0, 1024).split("\n", 1)[0] ?? "";
  const match = /^MODULE \S+ \S+ ([0-9A-Fa-f]{33,40}) (.+?)\s*$/.exec(first);
  return match?.[1] && match[2] ? { debugId: match[1].toUpperCase(), name: match[2] } : null;
}

type NewFile = { gameId: string; kind: DebugFileKind; name: string; debugId?: string; build?: string; bytes: Uint8Array; contentType: string };

/** Stores a debug file. Uploading the same one again replaces it. */
export async function saveDebugFile(db: Db, storage: Storage, f: NewFile) {
  const debugId = f.debugId ?? "";
  const build = f.build ?? "";
  const storageKey = `debug/${f.gameId}/${f.kind}/${encodeURIComponent(build || debugId)}/${encodeURIComponent(f.name)}`;
  await storage.put(storageKey, f.bytes, f.contentType);
  const values = { gameId: f.gameId, kind: f.kind, name: f.name, debugId, build, storageKey, size: f.bytes.byteLength };
  const [row] = await db
    .insert(debugFiles)
    .values(values)
    .onConflictDoUpdate({ target: [debugFiles.gameId, debugFiles.kind, debugFiles.name, debugFiles.debugId, debugFiles.build], set: { storageKey, size: values.size, uploadedAt: new Date() } })
    .returning({ id: debugFiles.id, kind: debugFiles.kind, name: debugFiles.name, debugId: debugFiles.debugId, build: debugFiles.build, size: debugFiles.size });
  return row;
}

export function listDebugFiles(db: Db, gameId: string) {
  return db
    .select({ id: debugFiles.id, kind: debugFiles.kind, name: debugFiles.name, debugId: debugFiles.debugId, build: debugFiles.build, size: debugFiles.size, uploadedAt: debugFiles.uploadedAt })
    .from(debugFiles)
    .where(eq(debugFiles.gameId, gameId))
    .orderBy(desc(debugFiles.uploadedAt))
    .limit(500);
}

export async function deleteDebugFile(db: Db, storage: Storage, gameId: string, id: string): Promise<boolean> {
  const [row] = await db.delete(debugFiles).where(and(eq(debugFiles.id, id), eq(debugFiles.gameId, gameId))).returning({ key: debugFiles.storageKey });
  if (row) await storage.delete(row.key).catch(() => undefined);
  return !!row;
}

/** Does this build have any source maps? Decides whether a JS crash waits for the worker. */
export async function hasSourceMaps(db: Db, gameId: string, build: string): Promise<boolean> {
  const [row] = await db
    .select({ id: debugFiles.id })
    .from(debugFiles)
    .where(and(eq(debugFiles.gameId, gameId), eq(debugFiles.kind, "sourcemap"), eq(debugFiles.build, build)))
    .limit(1);
  return !!row;
}

/** Source maps for a build, keyed by bundle file name. */
export async function sourceMapsFor(db: Db, storage: Storage, gameId: string, build: string): Promise<Map<string, string>> {
  const rows = await db.select().from(debugFiles).where(and(eq(debugFiles.gameId, gameId), eq(debugFiles.kind, "sourcemap"), eq(debugFiles.build, build)));
  const maps = new Map<string, string>();
  for (const r of rows) {
    const file = await storage.get(r.storageKey);
    if (file) maps.set(r.name, Buffer.from(file.body).toString("utf8"));
  }
  return maps;
}

/** Breakpad files matching the modules a dump references. */
export async function breakpadFor(db: Db, gameId: string, modules: { name: string; debugId: string }[]) {
  if (modules.length === 0) return [];
  const rows = await db
    .select()
    .from(debugFiles)
    .where(and(eq(debugFiles.gameId, gameId), eq(debugFiles.kind, "breakpad"), inArray(debugFiles.debugId, modules.map((m) => m.debugId.toUpperCase()))));
  return rows.filter((r) => modules.some((m) => m.name === r.name));
}
