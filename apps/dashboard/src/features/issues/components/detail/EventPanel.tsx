import { Button, Card, CardHeader, CopyButton } from "../../../../components/ui/index.ts";
import { cn } from "../../../../lib/cn.ts";
import { formatAgo } from "../../../../lib/format.ts";
import type { IssueEvent, IssueEventSummary } from "../../api/use-issue-events.ts";

const chDate = (s: string) => new Date(`${s.replace(" ", "T")}Z`);
const LEVEL_DOT: Record<string, string> = { error: "bg-danger", warning: "bg-warn", info: "bg-chart", debug: "bg-faint" };

type NavProps = { events: IssueEventSummary[]; index: number; onIndex: (i: number) => void };

/** Step through occurrences: newest first. */
export function EventNavigator({ events, index, onIndex }: NavProps) {
  const current = events[index];
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        <Button className="h-7 px-2" aria-label="Newer event" disabled={index === 0} onClick={() => onIndex(index - 1)}>
          ←
        </Button>
        <Button className="h-7 px-2" aria-label="Older event" disabled={index >= events.length - 1} onClick={() => onIndex(index + 1)}>
          →
        </Button>
      </div>
      <span className="text-xs text-muted">
        Event {index + 1} of {events.length}
        {events.length === 25 ? "+" : ""}
        {current && <> · {formatAgo(chDate(current.occurredAt))} · <span className="font-mono">{current.build}</span> · {current.platform}</>}
      </span>
    </div>
  );
}

export function StackTrace({ event }: { event: IssueEvent }) {
  const text = event.stack || `${event.type}: ${event.message}`;
  return (
    <Card>
      <CardHeader title="Stack trace" action={<CopyButton text={text} label="Copy stack" />} />
      <pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-5 whitespace-pre">{text}</pre>
    </Card>
  );
}

/** What happened before the crash, with time relative to it. */
export function Breadcrumbs({ event }: { event: IssueEvent }) {
  const crashAt = chDate(event.occurredAt).getTime();
  return (
    <Card>
      <CardHeader title="Breadcrumbs" action={<span className="text-xs text-muted">{event.breadcrumbs.length} before the crash</span>} />
      {event.breadcrumbs.length === 0 ? (
        <p className="p-4 text-xs text-muted">No breadcrumbs were sent with this event.</p>
      ) : (
        <ol className="flex flex-col py-2">
          {event.breadcrumbs.map((b, i) => (
            <li key={i} className="flex items-baseline gap-3 px-4 py-1 hover:bg-hover">
              <span className={cn("size-1.5 shrink-0 translate-y-[-1px] rounded-full", LEVEL_DOT[b.level ?? ""] ?? "bg-faint")} />
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted">{((new Date(b.ts).getTime() - crashAt) / 1000).toFixed(1)}s</span>
              {b.category && <span className="w-16 shrink-0 truncate text-[11px] text-muted">{b.category}</span>}
              <span className="font-mono text-xs">{b.name}</span>
              {b.message && <span className="min-w-0 flex-1 truncate text-xs text-muted">{b.message}</span>}
              {b.props && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">{JSON.stringify(b.props)}</span>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
