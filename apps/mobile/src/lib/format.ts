const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatCompact = (n: number) => compact.format(n);
/** 18402 → "18,402". */
export const formatNumber = (n: number) => whole.format(n);
/** 184.2 → "$184.20". */
export const formatUsd = (n: number) => usd.format(n);

/** Signed change, e.g. "+6.2%" / "−3.1%"; null (no earlier data) is "–". */
export function formatChange(ratio: number | null): string {
  if (ratio === null) return "–";
  return `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toFixed(1)}%`;
}

export const formatPercent = (ratio: number | null) => (ratio === null ? "–" : `${(ratio * 100).toFixed(1)}%`);

const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-11-07" (UTC) → "Nov 7". */
export const formatShortDay = (day: string) => shortDay.format(new Date(`${day}T00:00:00Z`));

/**
 * Parses API timestamps: ISO strings from Postgres and ClickHouse's "2026-11-18 09:41:00.123"
 * (UTC, no zone), which Hermes' Date won't read as-is.
 */
export function parseTime(value: string | Date): Date {
  if (value instanceof Date) return value;
  const ch = /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(value);
  return new Date(ch ? `${value.replace(" ", "T")}Z` : value);
}

/** "3m ago", "2h ago", "5d ago". Short on purpose: list rows on a phone are narrow. */
export function formatAgo(date: string | Date, now = Date.now()): string {
  const seconds = Math.max(0, (now - parseTime(date).getTime()) / 1000);
  const units: [string, number][] = [["d", 86_400], ["h", 3600], ["m", 60]];
  for (const [unit, size] of units) if (seconds >= size) return `${Math.floor(seconds / size)}${unit} ago`;
  return "just now";
}
