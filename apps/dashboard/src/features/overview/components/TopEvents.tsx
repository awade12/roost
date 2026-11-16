import { Card, CardHeader } from "../../../components/ui/index.ts";
import { EmptyState } from "../../../components/ui/index.ts";
import { formatNumber } from "../../../lib/format.ts";

/** Most frequent events in the last 24 hours, with a proportional bar. */
export function TopEvents({ events }: { events: { name: string; count: number }[] }) {
  const max = Math.max(...events.map((e) => e.count), 1);
  return (
    <Card>
      <CardHeader title="Top events" action={<span className="text-xs text-muted">Last 24 hours</span>} />
      {events.length === 0 ? (
        <EmptyState title="Quiet day">No events in the last 24 hours.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2.5 p-4">
          {events.map((e) => (
            <li key={e.name} className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="font-mono text-xs">{e.name}</span>
                <span className="font-mono text-xs text-muted">{formatNumber(e.count)}</span>
              </div>
              <div className="h-1 rounded-full bg-hover">
                <div className="h-full rounded-full bg-faint" style={{ width: `${(e.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
