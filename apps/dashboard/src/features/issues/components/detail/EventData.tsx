import type { ReactNode } from "react";
import { Card, CardHeader, CopyButton } from "../../../../components/ui/index.ts";
import type { IssueEvent } from "../../api/use-issue-events.ts";

function Rows({ entries }: { entries: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 p-4 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted">{k}</dt>
          <dd className="min-w-0 font-mono break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const display = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function Attachments({ files }: { files: IssueEvent["attachments"] }) {
  return (
  <Card>
    <CardHeader title="Attachments" />
    {files.length === 0 ? (
      <p className="p-4 text-xs text-muted">No files were sent with this event.</p>
    ) : (
      <ul className="py-1">
        {files.map((a) => (
          <li key={a.id} className="flex h-10 items-center gap-3 px-4 hover:bg-hover">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{a.name}</span>
            <span className="text-xs text-muted">{a.contentType}</span>
            <span className="w-16 text-right font-mono text-xs text-muted">{bytes(a.size)}</span>
            <a className="text-xs text-fg underline-offset-2 hover:underline" href={`/admin/attachments/${a.id}`} download={a.name}>
              Download
            </a>
          </li>
        ))}
      </ul>
    )}
  </Card>
  );
}

/** Everything the SDK attached to one event: device, tags, contexts, extra, files. */
export function EventData({ event }: { event: IssueEvent }) {
  const tags = Object.entries(event.tags);
  const contexts = Object.entries(event.contexts);
  const extra = Object.keys(event.extra).length ? JSON.stringify(event.extra, null, 2) : null;
  return (
    <>
      <Card>
        <CardHeader title="Event" action={<CopyButton text={event.id} label="Copy ID" />} />
        <Rows
          entries={[
            ["Level", event.level || event.kind],
            ["Build", event.build],
            ["Platform", `${event.platform} ${event.osVersion}`.trim()],
            ["Device", event.deviceModel || "—"],
            ["Player", event.playerId],
            ["Session", event.sessionId],
          ]}
        />
      </Card>
      {tags.length > 0 && (
        <Card>
          <CardHeader title="Tags" />
          <div className="flex flex-wrap gap-1.5 p-4">
            {tags.map(([k, v]) => (
              <span key={k} className="rounded-md border border-border px-2 py-1 font-mono text-[11px]">
                <span className="text-muted">{k}:</span> {v}
              </span>
            ))}
          </div>
        </Card>
      )}
      {contexts.map(([name, values]) => (
        <Card key={name}>
          <CardHeader title={`Context · ${name}`} />
          <Rows entries={Object.entries(values).map(([k, v]) => [k, display(v)])} />
        </Card>
      ))}
      {extra && (
        <Card>
          <CardHeader title="Extra" action={<CopyButton text={extra} label="Copy JSON" />} />
          <pre className="max-h-80 overflow-auto p-4 font-mono text-xs leading-5">{extra}</pre>
        </Card>
      )}
      <Attachments files={event.attachments} />
    </>
  );
}
