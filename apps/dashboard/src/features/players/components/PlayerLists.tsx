import { Link } from "@tanstack/react-router";
import { Card, CardHeader } from "../../../components/ui/index.ts";
import { formatAgo, formatNumber } from "../../../lib/format.ts";
import type { PlayerData } from "../api/use-players.ts";

const utc = (s: string) => new Date(`${s.replace(" ", "T")}Z`);

export function TopEvents({ events }: { events: PlayerData["profile"]["topEvents"] }) {
  const max = Math.max(1, ...events.map((e) => e.count));
  return (
    <Card>
      <CardHeader title="Top events" />
      <ul className="flex flex-col gap-1.5 p-4">
        {events.map((e) => (
          <li key={e.name} className="flex items-center gap-3 text-xs">
            <span className="w-36 shrink-0 truncate font-mono">{e.name}</span>
            <span className="h-1.5 rounded-full bg-chart" style={{ width: `${(e.count / max) * 100}%`, maxWidth: "60%" }} />
            <span className="ml-auto font-mono text-muted">{formatNumber(e.count)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PlayerCrashes({ crashes }: { crashes: PlayerData["profile"]["crashes"] }) {
  return (
    <Card>
      <CardHeader title="Crashes and errors" action={<span className="text-xs text-muted">{crashes.length}</span>} />
      {crashes.length === 0 && <p className="p-4 text-xs text-muted">None. Lucky player.</p>}
      <ul className="divide-y divide-border">
        {crashes.map((c) => (
          <li key={c.id}>
            <Link to="/issues/$issueId" params={{ issueId: c.issue_id }} className="flex h-10 items-center gap-3 px-4 hover:bg-hover">
              <span className="w-12 shrink-0 font-mono text-xs text-muted">{c.issueNumber ? `#${c.issueNumber}` : ""}</span>
              <span className="min-w-0 flex-1 truncate text-xs">
                <span className="font-medium">{c.type}</span>: {c.message}
              </span>
              <span className="text-xs text-muted">{c.build}</span>
              <span className="w-20 text-right text-xs text-muted">{formatAgo(utc(c.occurred_at))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PlayerReports({ reports }: { reports: PlayerData["reports"] }) {
  return (
    <Card>
      <CardHeader title="Reports they sent" action={<span className="text-xs text-muted">{reports.length}</span>} />
      {reports.length === 0 && <p className="p-4 text-xs text-muted">No bug reports from this player.</p>}
      <ul className="divide-y divide-border">
        {reports.map((r) => (
          <li key={r.id}>
            <Link to="/reports/$reportId" params={{ reportId: r.id }} className="flex h-10 items-center gap-3 px-4 hover:bg-hover">
              <span className="w-16 shrink-0 text-xs text-muted capitalize">{r.category}</span>
              <span className="min-w-0 flex-1 truncate text-xs">{r.message}</span>
              <span className="text-xs text-muted">{r.status}</span>
              <span className="w-20 text-right text-xs text-muted">{formatAgo(r.receivedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
