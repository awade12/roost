import type { Crash } from "@roost/contracts";
import { sha256 } from "../../auth/index.ts";

// Things that change between builds or runs without the bug changing.
const NOISE: [RegExp, string][] = [
  [/0x[0-9a-f]+/gi, "<addr>"],
  [/\b[0-9a-f]{8,}\b/gi, "<id>"],
  [/:\d+(:\d+)?/g, ""],
  [/\?[^\s)]*/g, ""],
  [/\b\d+\b/g, "<n>"],
  [/\s+/g, " "],
];

export function normalize(text: string): string {
  return NOISE.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), text).trim();
}

const basename = (file?: string) => file?.split(/[\\/]/).pop() ?? "?";

/** Up to three frames that identify where it broke: in-app frames first. */
export function topFrames(crash: Pick<Crash, "frames" | "stack" | "type" | "message">): string[] {
  if (crash.frames?.length) {
    const inApp = crash.frames.filter((f) => f.inApp !== false);
    return (inApp.length ? inApp : crash.frames).slice(0, 3).map((f) => `${f.function ?? "?"}@${basename(f.file)}`);
  }
  return crash.stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(`${crash.type}:`) && l !== crash.message)
    .slice(0, 3)
    .map(normalize);
}

/**
 * Same bug → same fingerprint, across builds, devices and players. A
 * developer-supplied fingerprint (from the SDK) replaces the automatic one.
 */
export function fingerprint(crash: Pick<Crash, "frames" | "stack" | "type" | "message"> & { fingerprint?: string[] | undefined }): string {
  if (crash.fingerprint?.length) return sha256(["custom", ...crash.fingerprint].join("\n")).slice(0, 32);
  const frames = topFrames(crash);
  // Without a stack, the message is the only identity we have.
  const parts = frames.length ? [crash.type, ...frames] : [crash.type, normalize(crash.message)];
  return sha256(parts.join("\n")).slice(0, 32);
}

/** Human-readable "where": the top in-app frame. */
export function culprit(crash: Pick<Crash, "frames" | "stack" | "type" | "message">): string | null {
  const frame = crash.frames?.find((f) => f.inApp !== false) ?? crash.frames?.[0];
  if (frame) return `${frame.function ?? "?"} (${basename(frame.file)}${frame.line ? `:${frame.line}` : ""})`;
  return topFrames(crash)[0]?.replace(/^at\s+/, "") ?? null;
}
