import { useState } from "react";
import { CopyButton } from "../../../components/ui/index.ts";
import { cn } from "../../../lib/cn.ts";
import { formatAgo } from "../../../lib/format.ts";
import type { EventItem } from "../api/use-events.ts";

// ClickHouse returns "YYYY-MM-DD hh:mm:ss.sss" in UTC.
const utc = (s: string) => new Date(`${s.replace(" ", "T")}Z`);

function props(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const preview = (p: Record<string, unknown>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("  ");

function Row({
  event,
  onPlayer,
  onName,
}: {
  event: EventItem;
  onPlayer: (id: string) => void;
  onName: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const p = props(event.props);
  const at = utc(event.occurred_at);
  return (
    <li className={cn("flex flex-col", open && "bg-hover/40")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
        className="flex h-9 cursor-default items-center gap-3 px-4 hover:bg-hover"
      >
        <span className="w-24 shrink-0 text-xs text-muted" title={at.toISOString()}>
          {formatAgo(at)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onName(event.name);
          }}
          className="w-40 shrink-0 truncate text-left font-mono text-xs hover:underline"
        >
          {event.name}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlayer(event.player_id);
          }}
          className="w-28 shrink-0 truncate text-left font-mono text-xs text-muted hover:text-fg hover:underline"
        >
          {event.player_id}
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
          {preview(p)}
        </span>
        {event.value !== null && <span className="shrink-0 font-mono text-xs">{event.value}</span>}
      </div>
      {open && <Detail event={event} props={p} at={at} />}
    </li>
  );
}

function Detail({
  event,
  props: p,
  at,
}: {
  event: EventItem;
  props: Record<string, unknown>;
  at: Date;
}) {
  const json = JSON.stringify(p, null, 2);
  return (
    <div className="flex flex-col gap-2 px-4 pb-3 pl-[124px] text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
        <span>{at.toISOString().replace("T", " ").replace("Z", " UTC")}</span>
        <span>build {event.build}</span>
        <span>{event.platform}</span>
        <span className="font-mono">session {event.session_id}</span>
      </div>
      <div className="relative rounded-md border border-border bg-bg">
        <pre className="overflow-x-auto p-3 font-mono text-[11px]">{json}</pre>
        <CopyButton text={json} className="absolute top-2 right-2" />
      </div>
    </div>
  );
}

/** Newest first. Click a row for its props; click a name or player to filter by it. */
export function EventStream({
  events,
  onPlayer,
  onName,
}: {
  events: EventItem[];
  onPlayer: (id: string) => void;
  onName: (name: string) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {events.map((e) => (
        <Row key={e.id} event={e} onPlayer={onPlayer} onName={onName} />
      ))}
    </ul>
  );
}
