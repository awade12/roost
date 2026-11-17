import type { Crash, EventContext, RoostEvent } from "./wire/index.ts";
import type { Attachment } from "./crash/transport.ts";

export type { EventContext, RoostEvent };

/**
 * Where the queue is persisted between launches. Pass AsyncStorage on Expo,
 * localStorage on web. Defaults to memory only (lost on quit).
 */
export type QueueStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
};

export type RoostOptions = {
  /** e.g. "https://roost.example.com" */
  endpoint: string;
  /** Client key for this game environment (safe to ship in builds). */
  clientKey: string;
  context: Omit<EventContext, "sdk">;
  playerId: string;
  storage?: QueueStorage;
  /** How often queued events are sent. Default 10 s. */
  flushIntervalMs?: number;
  /** Hook global error handlers (React Native / browser). Default true. */
  captureCrashes?: boolean;
  /** How many recent events/breadcrumbs go with a crash report. Default 50, max 100. */
  maxBreadcrumbs?: number;
  /**
   * Last chance to edit a report before it's saved and sent: scrub personal
   * data, add fields, or return null to drop it entirely.
   */
  beforeSend?: (report: Crash) => Crash | null;
  /**
   * Files to attach to every report, gathered at capture time, e.g. the
   * player's save: `() => [{ name: "save.json", data: JSON.stringify(save) }]`.
   * Up to 5 files, 10 MB each (2 MB for fatal crashes, which must be saved first).
   */
  getAttachments?: () => Attachment[] | Promise<Attachment[]>;
  /** How often flags are re-fetched. Default 5 minutes. Unchanged config costs one tiny 304. */
  configRefreshMs?: number;
  /** Swap in a custom fetch (tests, proxies). */
  fetch?: typeof fetch;
};
