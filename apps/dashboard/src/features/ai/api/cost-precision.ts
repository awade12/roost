import { useSyncExternalStore } from "react";
import { formatUsd, formatUsdExact } from "../../../lib/format.ts";

// How the AI page shows costs: rounded to the cent, or exact (most calls cost a fraction of a cent).
// Kept across reloads in this browser; localStorage is a convenience only and may be blocked.
export type CostPrecision = "rounded" | "exact";
const STORAGE_KEY = "roost:cost-precision";
const listeners = new Set<() => void>();

function read(): CostPrecision {
  try {
    return localStorage.getItem(STORAGE_KEY) === "exact" ? "exact" : "rounded";
  } catch {
    return "rounded";
  }
}

let current = read();

export function setCostPrecision(precision: CostPrecision) {
  current = precision;
  try {
    localStorage.setItem(STORAGE_KEY, precision);
  } catch {
    // Storage blocked: the choice still holds for this tab.
  }
  listeners.forEach((notify) => notify());
}

export function useCostPrecision(): CostPrecision {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => current,
  );
}

/** Formats a cost the way the page is set to show them. */
export function useCostFormat(): (usd: number) => string {
  return useCostPrecision() === "exact" ? formatUsdExact : formatUsd;
}
