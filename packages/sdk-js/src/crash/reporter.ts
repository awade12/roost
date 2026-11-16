import type { Crash } from "@roost/contracts";
import type { QueueStorage, RoostOptions } from "../types.ts";
import type { Scope } from "./scope.ts";
import { deliver, prepareFiles, refsFor, type Attachment, type PendingReport } from "./transport.ts";

const STORAGE_KEY = "roost:crashes";
const MAX_PENDING = 20;
/** A fatal crash must be saved before the app dies; keep saved files small enough for mobile storage. */
const MAX_SAVED_FILE_BYTES = 2 * 1024 * 1024;

export type CaptureOptions = {
  /** The app is about to die: save now, send on the next launch. */
  fatal?: boolean;
  level?: Crash["level"];
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown>>;
  extra?: Record<string, unknown>;
  /** Group by this instead of the stack, e.g. ["save-corrupt", slotId]. */
  fingerprint?: string[];
  /** Files for this report only (also see the `getAttachments` option). */
  attachments?: Attachment[];
};

/**
 * Builds, saves and sends crash/error reports. Reports are saved before sending,
 * so a fatal crash that kills the app is still delivered on the next launch.
 */
export class CrashReporter {
  private pending: PendingReport[] = [];
  private flushing = false;

  constructor(
    private readonly opts: RoostOptions,
    private readonly sessionId: string,
    private readonly scope: Scope,
    private readonly storage: QueueStorage | undefined,
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await this.storage?.getItem(STORAGE_KEY);
      if (raw) this.pending = (JSON.parse(raw) as PendingReport[]).concat(this.pending).slice(-MAX_PENDING);
    } catch {
      this.pending = [];
    }
  }

  private build(base: Pick<Crash, "kind" | "type" | "message" | "stack">, o: CaptureOptions, files: ReturnType<typeof prepareFiles>): Crash {
    return {
      ...base,
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      playerId: this.opts.playerId,
      breadcrumbs: this.scope.breadcrumbs(),
      tags: { ...this.scope.tags, ...o.tags },
      contexts: { ...this.scope.contexts, ...o.contexts },
      extra: { ...this.scope.extra, ...o.extra },
      attachments: refsFor(files),
      ...(o.level ? { level: o.level } : {}),
      ...(o.fingerprint ? { fingerprint: o.fingerprint } : {}),
    };
  }

  /** Never throws: reporting must not crash the game. */
  async capture(base: Pick<Crash, "kind" | "type" | "message" | "stack">, o: CaptureOptions = {}): Promise<void> {
    try {
      const extraFiles = (await this.opts.getAttachments?.()) ?? [];
      let files = prepareFiles([...(o.attachments ?? []), ...extraFiles]);
      if (o.fatal) files = files.filter((f) => f.base64.length * 0.75 <= MAX_SAVED_FILE_BYTES);
      const draft = this.build(base, o, files);
      const report = this.opts.beforeSend ? this.opts.beforeSend(draft) : draft;
      if (!report) return; // dropped by beforeSend
      const kept = files.filter((f) => report.attachments.some((a) => a.id === f.id));
      this.pending = [...this.pending, { report, files: kept, sent: false }].slice(-MAX_PENDING);
      await this.persist();
      if (!o.fatal) await this.flush();
    } catch {
      // Swallow: a broken report is better than a second crash.
    }
  }

  /** Sends saved reports and files. Whatever fails stays saved for next time. */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return;
    this.flushing = true;
    try {
      await deliver(this.opts, this.pending);
    } catch {
      // Offline: keep everything.
    } finally {
      this.pending = this.pending.filter((p) => !p.sent || p.files.length > 0);
      this.flushing = false;
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.pending));
    } catch {
      // Storage full or unavailable: keep in memory.
    }
  }
}
