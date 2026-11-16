import { useSyncExternalStore } from "react";

// Which environment the dashboard shows, shared by every component and kept
// across reloads. localStorage is a convenience only: it can be missing or
// blocked, and the app falls back to the first game's production environment.
const STORAGE_KEY = "roost:environment";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current = read();

export function selectEnvironment(id: string) {
  current = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage blocked: the choice still holds for this tab.
  }
  listeners.forEach((notify) => notify());
}

export function useStoredEnvironmentId(): string | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => current,
  );
}
