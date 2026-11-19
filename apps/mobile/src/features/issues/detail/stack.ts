/** Stack text as the API stores it → trimmed lines, without the "Type: message" header line. */
export function stackLines(stack: string, type: string): string[] {
  return stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i) => l.length > 0 && !(i === 0 && l.startsWith(`${type}:`)));
}

/** "−4.2s" relative to the crash; the crash itself is "0.0s". */
export function relativeSeconds(ts: string, crashAt: string): string {
  const s = (new Date(ts).getTime() - new Date(crashAt).getTime()) / 1000;
  if (!Number.isFinite(s)) return "";
  if (Math.abs(s) < 0.05) return "0.0s";
  const abs = Math.abs(s);
  const text = abs >= 3600 ? `${Math.round(abs / 3600)}h` : abs >= 60 ? `${Math.round(abs / 60)}m` : `${abs.toFixed(1)}s`;
  return s < 0 ? `−${text}` : `+${text}`;
}
