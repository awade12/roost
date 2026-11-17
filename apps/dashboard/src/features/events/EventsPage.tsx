import { useState } from "react";
import { AreaChart } from "../../components/charts/AreaChart.tsx";
import { Button, Card, CardHeader, EmptyState } from "../../components/ui/index.ts";
import { formatNumber } from "../../lib/format.ts";
import { useEnvironment } from "../studio/index.ts";
import { EMPTY_QUERY, useEventFacets, useEventSeries, useEventStream, type EventQuery } from "./api/use-events.ts";
import { EventFilters } from "./components/EventFilters.tsx";
import { EventStream } from "./components/EventStream.tsx";

function Chart({ envId, query }: { envId: string; query: EventQuery }) {
  const series = useEventSeries(envId, query);
  const total = series.data?.reduce((n, s) => n + s.events, 0) ?? 0;
  const hourly = query.range === "1h" || query.range === "24h";
  return (
    <Card>
      <CardHeader title={`${formatNumber(total)} events`} action={<span className="text-xs text-muted">UTC {hourly ? "hours" : "days"}</span>} />
      <div className="p-4">
        {series.isError && <p className="text-danger">{series.error.message}</p>}
        {series.data && series.data.length > 1 && <AreaChart data={series.data.map((s) => ({ day: s.bucket, value: s.events }))} label="Events" unit={hourly ? "hour" : "day"} height={160} />}
        {series.data && series.data.length <= 1 && <p className="py-6 text-center text-xs text-muted">Not enough data for a chart in this range.</p>}
      </div>
    </Card>
  );
}

function Stream({ envId, query, onQuery }: { envId: string; query: EventQuery; onQuery: (q: EventQuery) => void }) {
  const stream = useEventStream(envId, query);
  const events = stream.data?.pages.flatMap((p) => p.events) ?? [];
  return (
    <Card>
      {stream.isPending && <p className="px-4 py-3 text-muted">Loading events…</p>}
      {stream.isError && <p className="px-4 py-3 text-danger">{stream.error.message}</p>}
      {stream.data && events.length === 0 && <EmptyState title="No events match">Try a longer time range or fewer filters.</EmptyState>}
      {events.length > 0 && <EventStream events={events} onPlayer={(player) => onQuery({ ...query, player })} onName={(name) => onQuery({ ...query, name })} />}
      {stream.hasNextPage && (
        <div className="flex justify-center border-t border-border p-3">
          <Button variant="ghost" disabled={stream.isFetchingNextPage} onClick={() => void stream.fetchNextPage()}>
            {stream.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Every event the game sent, filtered by name, player, build, platform or any prop. */
export function EventsPage({ initialPlayer }: { initialPlayer?: string | undefined }) {
  const { selected } = useEnvironment();
  const [query, setQuery] = useState<EventQuery>({ ...EMPTY_QUERY, player: initialPlayer ?? "" });
  const facets = useEventFacets(selected?.env.id ?? "", query.range);
  if (!selected) {
    return (
      <Card className="mx-8 my-6">
        <EmptyState title="No games yet">Create a game under Settings first.</EmptyState>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Events</h1>
        <p className="text-muted">Everything {selected.game.name} sent to {selected.env.name}. Click a row for its props, or a name or player to filter by it.</p>
      </div>
      <EventFilters query={query} facets={facets.data} onChange={setQuery} />
      <Chart envId={selected.env.id} query={query} />
      <Stream envId={selected.env.id} query={query} onQuery={setQuery} />
    </div>
  );
}
