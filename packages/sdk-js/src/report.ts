import type { PlayerReport } from "./wire/index.ts";
import { fromBase64, prepareFiles, refsFor, type Attachment, type Scope } from "./crash/index.ts";
import type { RoostOptions } from "./types.ts";
import { uuid } from "./ids/index.ts";

export type ReportInput = {
  /** What the player wrote. Required, up to 4000 characters. */
  message: string;
  category?: PlayerReport["category"];
  /** Only pass this if the player chose to share it, so you can reply. */
  email?: string;
  /** E.g. a screenshot: `{ name: "screenshot.png", data: pngBytes, contentType: "image/png" }`. */
  attachments?: Attachment[];
  /** Also attach `getAttachments()` (e.g. the save file). Default true. */
  includeAttachments?: boolean;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export type ReportResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Sends a player's bug report right away, with the current tags, contexts and
 * breadcrumbs. Unlike crashes it isn't queued: the player is waiting, so the game
 * gets a result it can show ("Thanks!" or "Couldn't send, try again").
 */
export async function sendReport(opts: RoostOptions, sessionId: string, sdk: string, scope: Scope, input: ReportInput): Promise<ReportResult> {
  const send = opts.fetch ?? fetch;
  const headers = { "x-roost-key": opts.clientKey };
  try {
    const extraFiles = input.includeAttachments === false ? [] : ((await opts.getAttachments?.()) ?? []);
    const files = prepareFiles([...(input.attachments ?? []), ...extraFiles]);
    const report: PlayerReport = {
      id: uuid(),
      ts: new Date().toISOString(),
      playerId: opts.playerId,
      sessionId,
      category: input.category ?? "bug",
      message: input.message.slice(0, 4000),
      ...(input.email ? { email: input.email } : {}),
      tags: { ...scope.tags, ...input.tags },
      contexts: scope.contexts,
      extra: { ...scope.extra, ...input.extra },
      breadcrumbs: scope.breadcrumbs(),
      attachments: refsFor(files),
    };
    const res = await send(`${opts.endpoint}/v1/reports`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ context: { ...opts.context, sdk }, report }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    for (const file of files) {
      await send(`${opts.endpoint}/v1/reports/${report.id}/attachments/${file.id}`, {
        method: "PUT",
        headers: { ...headers, "content-type": file.contentType, "x-filename": encodeURIComponent(file.name) },
        body: fromBase64(file.base64),
      });
    }
    return { ok: true, id: report.id };
  } catch {
    return { ok: false, error: "offline" };
  }
}
