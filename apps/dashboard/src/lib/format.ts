const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export const formatCompact = (n: number) => compact.format(n);
export const formatNumber = (n: number) => whole.format(n);
/** "YYYY-MM-DD" (UTC) → "Nov 7". */
export const formatShortDay = (day: string) => shortDay.format(new Date(`${day}T00:00:00Z`));
/** "YYYY-MM-DD" (UTC) → "Fri, Nov 7". */
export const formatLongDay = (day: string) => longDay.format(new Date(`${day}T00:00:00Z`));
export const formatPercent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;
/** Signed change, e.g. "+6.2%" / "−3.1%". */
export const formatChange = (ratio: number) => `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toFixed(1)}%`;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
export const formatUsd = (n: number) => usd.format(n);
const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto", style: "short" });
/** "3 min. ago", "2 days ago". */
export function formatAgo(date: string | Date): string {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return "just now";
}
const hour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const longHour = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
/** ISO hour bucket (UTC) → "09:00". */
export const formatHour = (iso: string) => hour.format(new Date(iso));
/** ISO hour bucket (UTC) → "Mon, Nov 16, 09:00". */
export const formatLongHour = (iso: string) => longHour.format(new Date(iso));
