import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, type Crash } from "@roost/contracts";
import type { RoostOptions } from "../types.ts";

/** A file to send with a report, e.g. the player's save. */
export type Attachment = { name: string; data: string | Uint8Array; contentType?: string };

/** A file waiting to upload, stored as base64 so it survives in string storage. */
export type PendingFile = { id: string; name: string; contentType: string; base64: string };
export type PendingReport = { report: Crash; files: PendingFile[]; sent: boolean };

const toBytes = (data: string | Uint8Array) => (typeof data === "string" ? new TextEncoder().encode(data) : data);
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
export const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Turns attachments into pending files + the refs the report declares. Over-limit files are dropped. */
export function prepareFiles(attachments: Attachment[]): PendingFile[] {
  return attachments
    .map((a) => ({ a, bytes: toBytes(a.data) }))
    .filter(({ bytes }) => bytes.byteLength <= MAX_ATTACHMENT_BYTES)
    .slice(0, MAX_ATTACHMENTS)
    .map(({ a, bytes }) => ({
      id: crypto.randomUUID(),
      name: a.name.slice(0, 128),
      contentType: a.contentType ?? (typeof a.data === "string" ? "text/plain" : "application/octet-stream"),
      base64: toBase64(bytes),
    }));
}

export function refsFor(files: PendingFile[]): Crash["attachments"] {
  return files.map((f) => ({ id: f.id, name: f.name, contentType: f.contentType, size: fromBase64(f.base64).byteLength }));
}

/** 2xx, or a 4xx that retrying won't fix (except 429). */
const done = (status: number) => (status >= 200 && status < 300) || (status >= 400 && status < 500 && status !== 429);

/** POST the reports, then PUT each file. Mutates `sent` and `files` to track progress. */
export async function deliver(opts: RoostOptions, pending: PendingReport[]): Promise<void> {
  const send = opts.fetch ?? fetch;
  const headers = { "x-roost-key": opts.clientKey };
  const unsent = pending.filter((p) => !p.sent);
  if (unsent.length) {
    const res = await send(`${opts.endpoint}/v1/crashes`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ context: { ...opts.context, sdk: "js/0.2.0" }, crashes: unsent.map((p) => p.report) }),
    });
    if (!done(res.status)) return;
    for (const p of unsent) p.sent = true;
  }
  for (const p of pending.filter((x) => x.sent)) {
    for (const file of [...p.files]) {
      const res = await send(`${opts.endpoint}/v1/crashes/${p.report.id}/attachments/${file.id}`, {
        method: "PUT",
        headers: { ...headers, "content-type": file.contentType, "x-filename": encodeURIComponent(file.name) },
        body: fromBase64(file.base64),
      });
      if (!done(res.status)) return;
      p.files = p.files.filter((f) => f !== file);
    }
  }
}
