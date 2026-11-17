import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { StackFrame } from "@roost/contracts";

const run = promisify(execFile);

/** The parts of `minidump-stackwalk --json` we use (rust-minidump's JSON schema). */
type Walk = {
  crash_info?: { type?: string | null; address?: string | null; crashing_thread?: number | null };
  system_info?: { os?: string; os_ver?: string; cpu_arch?: string };
  crashing_thread?: { thread_name?: string | null; frames?: WalkFrame[] };
  main_module?: number | null;
  modules?: { filename?: string; debug_file?: string | null; debug_id?: string | null; missing_symbols?: boolean }[];
};
type WalkFrame = { module?: string | null; function?: string | null; file?: string | null; line?: number | null; module_offset?: string | null; offset?: string | null };

/** Runs Mozilla's minidump-stackwalk. `symbolsDir` is a Breakpad symbol tree, if any symbols matched. */
export async function stackwalk(binary: string, dumpPath: string, symbolsDir?: string): Promise<Walk> {
  const args = ["--json", ...(symbolsDir ? ["--symbols-path", symbolsDir] : []), dumpPath];
  const { stdout } = await run(binary, args, { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
  return JSON.parse(stdout) as Walk;
}

/** Modules the dump references, as Breakpad names them (debug file + debug id). */
export function walkModules(walk: Walk): { name: string; debugId: string }[] {
  return (walk.modules ?? []).flatMap((m) => (m.debug_file && m.debug_id ? [{ name: m.debug_file, debugId: m.debug_id.toUpperCase() }] : []));
}

/** Lays symbol files out the way Breakpad looks them up: <debug file>/<debug id>/<name>.sym. */
export async function writeSymbolTree(dir: string, files: { name: string; debugId: string; text: Uint8Array }[]) {
  for (const f of files) {
    const folder = join(dir, f.name, f.debugId);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, `${f.name.replace(/\.pdb$/i, "")}.sym`), f.text);
  }
}

const INTERNAL = ["std::", "core::", "alloc::", "<std::", "<core::", "<alloc::", "rust_begin_unwind", "__rust", "_pthread", "start_thread", "__libc", "_start", "RtlUserThreadStart", "BaseThreadInitThunk"];

/**
 * A crash from a stackwalk: the type from the OS exception ("EXC_BAD_ACCESS"), the reason
 * and address as the message, and the crashing thread's frames. Frames without symbols are
 * named `module+0xoffset`, which is stable within one build. The game's own module counts as in-app.
 */
export function crashFromWalk(walk: Walk) {
  const [type = "native crash", reason] = (walk.crash_info?.type ?? "native crash").split(" / ");
  const address = walk.crash_info?.address;
  const main = walk.modules?.[walk.main_module ?? -1]?.filename;
  const frames: StackFrame[] = (walk.crashing_thread?.frames ?? []).slice(0, 100).map((f) => {
    const name = f.function ?? (f.module ? `${f.module}+${f.module_offset ?? "?"}` : (f.offset ?? "?"));
    const internal = INTERNAL.some((p) => name.startsWith(p));
    return { function: name.slice(0, 256), ...(f.file ? { file: f.file.slice(0, 512) } : {}), ...(f.line ? { line: f.line } : {}), inApp: !!main && f.module === main && !internal };
  });
  const lines = frames.map((f, i) => `  ${String(i).padStart(2)}: ${f.function}${f.file ? `\n        at ${f.file}${f.line ? `:${f.line}` : ""}` : ""}`);
  const message = [reason, address ? `at ${address}` : null].filter(Boolean).join(" ") || "Native crash";
  const symbolicated = (walk.modules ?? []).filter((m) => m.missing_symbols === false).length;
  return {
    type: type.slice(0, 128),
    message: message.slice(0, 2000),
    stack: [`${type}${reason ? ` / ${reason}` : ""}${address ? ` at ${address}` : ""}`, `thread: ${walk.crashing_thread?.thread_name ?? "?"}`, ...lines].join("\n").slice(0, 32_000),
    frames,
    native: { os: [walk.system_info?.os, walk.system_info?.os_ver].filter(Boolean).join(" "), cpu: walk.system_info?.cpu_arch ?? "", modules_with_symbols: symbolicated, main_module: main ?? "" },
  };
}
