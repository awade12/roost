type Capture = (error: unknown, fatal: boolean) => void;

type RNErrorUtils = {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};

/** Hooks React Native's global handler, or browser error events. Returns an uninstall function. */
export function installHandlers(capture: Capture): () => void {
  const rn = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (rn) {
    const previous = rn.getGlobalHandler();
    rn.setGlobalHandler((error, isFatal) => {
      capture(error, isFatal ?? false);
      previous(error, isFatal); // keep React Native's own behavior (red box, crash)
    });
    return () => rn.setGlobalHandler(previous);
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    const onError = (e: ErrorEvent) => capture(e.error ?? e.message, false);
    const onRejection = (e: PromiseRejectionEvent) => capture(e.reason, false);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }
  return () => {};
}
