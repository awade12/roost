import type { AiDecideResponse, AiRunResponse } from "./wire/index.ts";
import { MAX_EVENTS_PER_BATCH } from "@roost/contracts/limits";
import { runAi, runDecision, streamAi, type AiOptions, type AiVars, type DecisionState } from "./ai/index.ts";
import { CrashReporter, installHandlers, Scope, type BreadcrumbInput, type CaptureOptions } from "./crash/index.ts";
import { createProvider, FlagStore } from "./flags/index.ts";
import { EventQueue } from "./queue.ts";
import { sendReport, type ReportInput, type ReportResult } from "./report.ts";
import type { RoostOptions } from "./types.ts";
import { uuid } from "./ids/index.ts";

const SDK_VERSION = "js/0.3.0";

export class Roost {
  private readonly queue: EventQueue;
  private readonly sessionId = uuid();
  private readonly crashes: CrashReporter;
  private readonly scope: Scope;
  private flushing = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private uninstall: (() => void) | undefined;
  private configTimer: ReturnType<typeof setInterval> | undefined;
  /** Remote config and flags from the dashboard, resolved for this player. */
  readonly flags: FlagStore;

  constructor(private readonly opts: RoostOptions) {
    this.queue = new EventQueue(opts.storage);
    this.scope = new Scope(opts.maxBreadcrumbs);
    this.crashes = new CrashReporter(opts, this.sessionId, this.scope, opts.storage);
    this.flags = new FlagStore(opts, opts.storage);
  }

  /**
   * Loads anything left from the last launch (events and crash reports), sends
   * saved crashes, starts the flush timer, and installs crash handlers unless
   * `captureCrashes: false`.
   */
  async start(): Promise<void> {
    await Promise.all([this.queue.load(), this.crashes.load(), this.flags.load()]);
    void this.flags.refresh();
    this.configTimer = setInterval(() => void this.flags.refresh(), this.opts.configRefreshMs ?? 300_000);
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

  /**
   * Sends a bug report the player wrote ("Report a bug" in your menu), with a screenshot
   * if you pass one and your `getAttachments` files (e.g. the save). Never throws.
   */
  report(input: ReportInput): Promise<ReportResult> {
    return sendReport(this.opts, this.sessionId, SDK_VERSION, this.scope, input);
  }

  /** An OpenFeature provider over `flags`, for code that already uses OpenFeature. */
  openFeatureProvider() {
    return createProvider(this.flags);
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
      id: uuid(),
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
   * Runs a prompt template on the Roost AI proxy. Unlike tracking, this throws on failure
   * (e.g. `rate_limited` when the player's budget is used up) so the game can show its own
   * fallback line. Options add conversation history, or pick one of the template's models.
   */
  ai(template: string, vars: AiVars = {}, options: AiOptions = {}): Promise<AiRunResponse> {
    return runAi(this.opts, template, vars, options);
  }

  /** Like `ai`, but text arrives as it's written: `onDelta` gets each piece (for typewriter dialogue). */
  aiStream(template: string, vars: AiVars, options: AiOptions & { onDelta: (text: string) => void }): Promise<AiRunResponse> {
    return streamAi(this.opts, template, vars, options);
  }

  /**
   * Runs a decision template (a server-side set of yes/no, choice and score questions) on some
   * state, e.g. to classify what a player wrote. Throws `RoostAiError` on failure like `ai`.
   */
  decide(decision: string, state: DecisionState): Promise<AiDecideResponse> {
    return runDecision(this.opts, decision, state);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.configTimer) clearInterval(this.configTimer);
    this.uninstall?.();
    this.track("session_end");
    await this.flush();
  }
}
