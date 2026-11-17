import type { FlagType } from "../api/use-flags.ts";

/** Values are edited as text and parsed by the flag's type on save. */
export function parseValue(type: FlagType, text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = text.trim();
  if (type === "string") return { ok: true, value: text };
  if (type === "boolean") return t === "true" || t === "false" ? { ok: true, value: t === "true" } : { ok: false, error: "use true or false" };
  if (type === "number") return t !== "" && Number.isFinite(Number(t)) ? { ok: true, value: Number(t) } : { ok: false, error: `"${t}" isn't a number` };
  try {
    return { ok: true, value: JSON.parse(t) as unknown };
  } catch {
    return { ok: false, error: "isn't valid JSON" };
  }
}

export const showValue = (type: FlagType, value: unknown): string => (type === "string" ? String(value) : type === "json" ? JSON.stringify(value, null, 2) : String(value));

/** Overrides as "player-id = value" lines. */
export function parseOverrides(type: FlagType, text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  for (const [i, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    const at = line.indexOf("=");
    const player = line.slice(0, at).trim();
    if (at < 1 || !player) return { ok: false, error: `line ${i + 1}: write player-id = value` };
    const parsed = parseValue(type, line.slice(at + 1).trim());
    if (!parsed.ok) return { ok: false, error: `line ${i + 1}: ${parsed.error}` };
    out[player] = parsed.value;
  }
  return { ok: true, value: out };
}

export const showOverrides = (type: FlagType, overrides: Record<string, unknown>) =>
  Object.entries(overrides)
    .map(([p, v]) => `${p} = ${type === "json" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
