import type { ConfigResponse, FlagType, ResolvedFlag } from "../wire/index.ts";
import type { QueueStorage, RoostOptions } from "../types.ts";

const STORAGE_KEY = "roost.config";

/** OpenFeature-shaped result: the value, plus why (and, on a miss, what went wrong). */
export type FlagDetails<T> = {
  value: T;
  variant?: string;
  reason: "STATIC" | "SPLIT" | "TARGETING_MATCH" | "DEFAULT" | "ERROR";
  errorCode?: "FLAG_NOT_FOUND" | "TYPE_MISMATCH";
};

const typeOf = (v: unknown): FlagType => (typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : typeof v === "string" ? "string" : "json");

/**
 * Flags resolved for this player by the server. Reads never wait on the network: they use
 * the last values fetched (kept in storage across launches), or your default.
 */
export class FlagStore {
  private flags: Record<string, ResolvedFlag> = {};
  private version: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly opts: RoostOptions,
    private readonly storage: QueueStorage | undefined,
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await this.storage?.getItem(STORAGE_KEY);
      if (raw) ({ flags: this.flags, version: this.version } = JSON.parse(raw) as ConfigResponse);
    } catch {
      this.flags = {};
    }
  }

  /** Fetches the latest values. Never throws; returns true if anything changed. */
  async refresh(): Promise<boolean> {
    try {
      const url = `${this.opts.endpoint}/v1/config?playerId=${encodeURIComponent(this.opts.playerId)}`;
      const headers: Record<string, string> = { "x-roost-key": this.opts.clientKey };
      if (this.version) headers["if-none-match"] = `"${this.version}"`;
      const res = await (this.opts.fetch ?? fetch)(url, { headers });
      if (res.status === 304 || !res.ok) return false;
      const body = (await res.json()) as ConfigResponse;
      this.flags = body.flags;
      this.version = body.version;
      await this.storage?.setItem(STORAGE_KEY, JSON.stringify(body));
      this.listeners.forEach((notify) => notify());
      return true;
    } catch {
      return false;
    }
  }

  details<T>(key: string, fallback: T, type: FlagType): FlagDetails<T> {
    const flag = this.flags[key];
    if (!flag) return { value: fallback, reason: "ERROR", errorCode: "FLAG_NOT_FOUND" };
    if (flag.type !== type && !(type === "json" && typeOf(flag.value) === "json")) return { value: fallback, reason: "ERROR", errorCode: "TYPE_MISMATCH" };
    // The server checked the value against the flag's type when it was saved.
    return { value: flag.value as T, variant: flag.variant, reason: flag.reason };
  }

  getBoolean(key: string, fallback: boolean): boolean {
    return this.details(key, fallback, "boolean").value;
  }

  getString(key: string, fallback: string): string {
    return this.details(key, fallback, "string").value;
  }

  getNumber(key: string, fallback: number): number {
    return this.details(key, fallback, "number").value;
  }

  /** A JSON flag, e.g. tuning values: `getObject("enemy.tuning", { hp: 100 })`. */
  getObject<T>(key: string, fallback: T): T {
    return this.details(key, fallback, "json").value;
  }

  /** Called after values change (a refresh brought something new). Returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
