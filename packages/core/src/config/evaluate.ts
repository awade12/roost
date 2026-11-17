import { createHash } from "node:crypto";
import type { FlagType, ResolvedFlag } from "@roost/contracts";

export type FlagRow = { key: string; type: FlagType; value: unknown; rollout: { percent: number; value: unknown } | null; overrides: Record<string, unknown> };

/**
 * 0–99.99, stable per flag and player: the same player stays in or out of a rollout as the
 * percent changes (raising 10% → 20% only adds players), and each flag buckets independently.
 */
export function bucket(flagKey: string, playerId: string): number {
  const hash = createHash("sha256").update(`${flagKey}:${playerId}`).digest();
  return (hash.readUInt32BE(0) % 10_000) / 100;
}

/** What one player gets for one flag: override, then rollout bucket, then the default. */
export function resolveFlag(flag: FlagRow, playerId: string): ResolvedFlag {
  if (Object.hasOwn(flag.overrides, playerId)) return { type: flag.type, value: flag.overrides[playerId], variant: "override", reason: "TARGETING_MATCH" };
  if (flag.rollout && flag.rollout.percent > 0) {
    const inRollout = bucket(flag.key, playerId) < flag.rollout.percent;
    return { type: flag.type, value: inRollout ? flag.rollout.value : flag.value, variant: inRollout ? "rollout" : "default", reason: "SPLIT" };
  }
  return { type: flag.type, value: flag.value, variant: "default", reason: "STATIC" };
}

/** True if `value` fits the flag's type; json accepts any JSON value. */
export function matchesType(type: FlagType, value: unknown): boolean {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string" && value.length <= 4000;
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return value !== undefined && JSON.stringify(value).length <= 32_000;
}

/** Every value a flag can serve (default, rollout, overrides) fits its type. */
export function flagValuesMatch(type: FlagType, f: { value: unknown; rollout: { value: unknown } | null; overrides: Record<string, unknown> }): boolean {
  const values = [f.value, ...(f.rollout ? [f.rollout.value] : []), ...Object.values(f.overrides)];
  return values.every((v) => matchesType(type, v));
}

/** Deep equality for JSON values, ignoring key order (Postgres jsonb reorders keys). */
export function sameJson(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)])) : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
