/** "YYYY-MM-DD" for a UTC date. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last `count` UTC days, oldest first, ending today. */
export function lastDays(count: number, now = new Date()): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, i) => isoDay(new Date(today - (count - 1 - i) * 86_400_000)));
}

/** Mean of the last 7 values vs the 7 before them. `change` is null when there's no baseline. */
export function weekOverWeek(values: number[]) {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const current = mean(values.slice(-7));
  const previous = mean(values.slice(-14, -7));
  return { value: Math.round(current), change: previous > 0 ? (current - previous) / previous : null };
}
