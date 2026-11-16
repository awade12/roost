import { MAX_EVENTS_PER_BATCH, type AiRunResponse, type ErrorBody } from "@roost/contracts";
import { CrashReporter, installHandlers, Scope, type BreadcrumbInput, type CaptureOptions } from "./crash/index.ts";
import { EventQueue } from "./queue.ts";
import type { RoostOptions } from "./types.ts";

const SDK_VERSION = "js/0.2.0";

/** An AI proxy call failed. `code` is the API error code, e.g. "rate_limited". */
export class RoostAiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class Roost {
  private readonly queue: EventQueue;
  private readonly sessionId = crypto.randomUUID();
  private readonly crashes: CrashReporter;
  private readonly scope: Scope;
  private flushing = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private uninstall: (() => void) | undefined;

  constructor(private readonly opts: RoostOptions) {
    this.queue = new EventQueue(opts.storage);
    this.scope = new Scope(opts.maxBreadcrumbs);
    this.crashes = new CrashReporter(opts, this.sessionId, this.scope, opts.storage);
  }

  /**
   * Loads anything left from the last launch (events and crash reports), sends
   * saved crashes, starts the flush timer, and installs crash handlers unless
   * `captureCrashes: false`.
   */
  async start(): Promise<void> {
    await Promise.all([this.queue.load(), this.crashes.load()]);
    if (this.opts.captureCrashes !== false) {
      this.uninstall = installHandlers((error, fatal) => void this.captureError(error, { fatal }));
    }
    void this.crashes.flush();
    this.timer = setInterval(() => void this.flush(), this.opts.flushIntervalMs ?? 10_000);
    this.track("session_start");
  }

  /**
   * Report an error. Options add tags, contexts, extra data, files, a level, or
   * your own grouping key; `fatal: true` saves it to send on the next launch.
   * Never throws.
   */
  captureError(error: unknown, options: CaptureOptions = {}): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));
    const kind = options.fatal ? "crash" : "error";
    return this.crashes.capture({ kind, type: err.name || "Error", message: err.message.slice(0, 2000), stack: (err.stack ?? "").slice(0, 32_000) }, options);
  }

  /** Report something that isn't an exception, e.g. "Save migration fell back to defaults". */
  captureMessage(message: string, options: CaptureOptions = {}): Promise<void> {
    return this.crashes.capture({ kind: "message", type: "Message", message: message.slice(0, 2000), stack: "" }, { level: "info", ...options });
  }

  /** Tag every later report, e.g. setTag("level", "forest-3"). Searchable in the dashboard. */
  setTag(key: string, value: string | number | boolean): void {
    this.scope.setTag(key, value);
  }

  removeTag(key: string): void {
    this.scope.removeTag(key);
  }

  /** A named block of structured data on every later report, e.g. setContext("match", { round: 3 }). `null` removes it. */
  setContext(name: string, data: Record<string, unknown> | null): void {
    this.scope.setContext(name, data);
  }

  /** Any extra JSON value on every later report (keep it small; use attachments for files). */
  setExtra(key: string, value: unknown): void {
    this.scope.setExtra(key, value);
  }

  /** Record something that happened, without sending an analytics event. Shows up before the next crash. */
  addBreadcrumb(crumb: BreadcrumbInput): void {
    this.scope.addBreadcrumb(crumb);
  }

  track(name: string, props?: Record<string, string | number | boolean | null>, value?: number): void {
    const ts = new Date().toISOString();
    this.scope.addBreadcrumb({ name, ts, category: "event", ...(props ? { props } : {}) });
    this.queue.push({
      id: crypto.randomUUID(),
      name,
      ts,
      sessionId: this.sessionId,
      playerId: this.opts.playerId,
      ...(props ? { props } : {}),
      ...(value !== undefined ? { value } : {}),
    });
  }

  /** Sends queued events. Never throws: on failure the events stay queued for next time. */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.size === 0) return;
    this.flushing = true;
    try {
      const batch = this.queue.peek(MAX_EVENTS_PER_BATCH);
      const res = await (this.opts.fetch ?? fetch)(`${this.opts.endpoint}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-roost-key": this.opts.clientKey },
        body: JSON.stringify({ context: { ...this.opts.context, sdk: SDK_VERSION }, events: batch }),
      });
      // 4xx other than 429 means the batch itself is bad; drop it so it can't block the queue.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        this.queue.drop(batch.length);
      }
    } catch {
      // Offline: try again on the next tick.
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Runs a prompt template on the Roost AI proxy. Unlike tracking, this throws
   * on failure (e.g. `rate_limited` when the player's budget is used up) so the
   * game can show its own fallback line.
   */
  async ai(template: string, vars: Record<string, string | number | boolean> = {}): Promise<AiRunResponse> {
    const res = await (this.opts.fetch ?? fetch)(`${this.opts.endpoint}/v1/ai/run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-roost-key": this.opts.clientKey },
      body: JSON.stringify({ template, vars, playerId: this.opts.playerId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorBody | null;
      throw new RoostAiError(body?.error.code ?? "internal", body?.error.message ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as AiRunResponse;
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.uninstall?.();
    this.track("session_end");
    await this.flush();
  }
}
