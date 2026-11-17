import { call, errorText, type Target } from "../api.ts";
import { loadConfig } from "../load.ts";

type Change = { kind: string; name: string; result: string; error?: string };
const MARK: Record<string, string> = { created: "+", updated: "~", deleted: "-", unchanged: "=", error: "!" };

/** Sends the config file; prints one line per template, flag and limit. Exit code 1 on any error. */
export async function push(t: Target, opts: { file: string; prune: boolean; dryRun: boolean }): Promise<number> {
  const config = await loadConfig(opts.file);
  const query = new URLSearchParams({ prune: String(opts.prune), dry_run: String(opts.dryRun) });
  const { status, data } = await call<{ changes?: Change[] }>(t, "PUT", `/manage/config?${query}`, config);
  if (!data?.changes) {
    console.error(`push failed (${status}): ${errorText(data)}`);
    return 1;
  }
  for (const c of data.changes) {
    if (c.result === "unchanged") continue;
    console.log(`${MARK[c.result] ?? "?"} ${c.kind} ${c.name}${c.error ? `: ${c.error}` : ""}`);
  }
  const counts = data.changes.reduce<Record<string, number>>((n, c) => ({ ...n, [c.result]: (n[c.result] ?? 0) + 1 }), {});
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
  console.log(`${opts.dryRun ? "Dry run, nothing changed: " : ""}${summary || "nothing in the file"}`);
  return status === 200 ? 0 : 1;
}
