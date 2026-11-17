import { symbolication } from "@roost/core";

const EVERY_MS = 5_000;

/**
 * Drains the symbolication queue (native minidumps, source-mapped JS crashes) every few
 * seconds: crashes wait here before they're grouped, so a minute-long cron would be too slow.
 * Rows are claimed with SKIP LOCKED, so running several workers is safe.
 */
export function startSymbolication(deps: symbolication.SymbolicationDeps): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const done = await symbolication.processPending(deps);
      if (done) console.log(JSON.stringify({ msg: "crashes symbolicated", done }));
    } catch (err) {
      console.error(JSON.stringify({ msg: "symbolication failed", err: err instanceof Error ? err.message : "unknown" }));
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), EVERY_MS);
  return () => clearInterval(timer);
}
