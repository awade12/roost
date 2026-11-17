import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type { Crash, StackFrame } from "@roost/contracts";

type RawFrame = { fn: string | undefined; file: string; line: number; column: number };

// V8 / Hermes: "at fn (file:1:2)", "at file:1:2", "at fn (address at index.android.bundle:1:2)".
const V8 = /^\s*at (?:(.+?) \()?(?:address at )?(.+?):(\d+):(\d+)\)?\s*$/;
// JavaScriptCore / SpiderMonkey: "fn@file:1:2" or "@file:1:2".
const GECKO = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

/** Frames from a JS stack string, innermost first. Lines that aren't frames are skipped. */
export function parseJsStack(stack: string): RawFrame[] {
  const frames: RawFrame[] = [];
  for (const line of stack.split("\n")) {
    const m = V8.exec(line) ?? GECKO.exec(line);
    if (m?.[2] && m[3] && m[4]) frames.push({ fn: m[1] || undefined, file: m[2], line: Number(m[3]), column: Number(m[4]) });
  }
  return frames;
}

/** "https://cdn/app/main.js?v=3#x" → "main.js" (query and hash first, then the path). */
const basename = (path: string) => (path.split(/[?#]/)[0] ?? path).split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/**
 * Rewrites a JS crash's stack through source maps keyed by bundle file name. Frames in
 * bundles without a map are kept as they are. Library code (node_modules) isn't in-app.
 */
export function applySourceMaps(crash: Crash, maps: Map<string, string>): Crash {
  const parsed = new Map<string, TraceMap>();
  const traceFor = (name: string) => {
    if (!parsed.has(name)) {
      const raw = maps.get(name);
      if (!raw) return undefined;
      parsed.set(name, new TraceMap(raw));
    }
    return parsed.get(name);
  };
  const raw = parseJsStack(crash.stack);
  if (raw.length === 0) return crash;
  let mapped = 0;
  const frames: StackFrame[] = raw.map((f) => {
    const trace = traceFor(basename(f.file));
    // Stack columns are 1-based; source maps are 0-based.
    const pos = trace ? originalPositionFor(trace, { line: f.line, column: Math.max(0, f.column - 1) }) : null;
    if (!pos?.source || pos.line === null) return { function: f.fn, file: f.file, line: f.line, column: f.column, inApp: !f.file.includes("node_modules") };
    mapped += 1;
    return { function: pos.name ?? f.fn, file: pos.source, line: pos.line, column: (pos.column ?? 0) + 1, inApp: !pos.source.includes("node_modules") };
  });
  if (mapped === 0) return crash;
  const lines = frames.map((f) => `    at ${f.function ?? "<anonymous>"} (${f.file}:${f.line}:${f.column})`);
  return { ...crash, frames, stack: [`${crash.type}: ${crash.message}`, ...lines].join("\n").slice(0, 32_000) };
}
