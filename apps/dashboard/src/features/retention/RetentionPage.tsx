import { useState } from "react";
import { Card, CardHeader, EmptyState, Segmented, Select } from "../../components/ui/index.ts";
import { formatNumber, formatPercent } from "../../lib/format.ts";
import { useEventFacets } from "../events/index.ts";
import { useEnvironment } from "../studio/index.ts";
import { useRetention, type RetentionData, type RetentionQuery } from "./api/use-retention.ts";
import { CohortGrid } from "./components/CohortGrid.tsx";

const HEADLINE = [1, 7, 30] as const;

function Summary({ data }: { data: RetentionData }) {
  const players = data.cohorts.reduce((n, c) => n + c.size, 0);
  return (
    <div className="grid grid-cols-4 gap-3">
      <Card className="flex flex-col gap-1 p-4">
        <span className="text-xs text-muted">New players</span>
        <span className="text-2xl font-semibold tracking-tight">{formatNumber(players)}</span>
      </Card>
      {HEADLINE.map((d) => {
        const value = data.average[d];
        return (
          <Card key={d} className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted">D{d} retention</span>
            <span className="text-2xl font-semibold tracking-tight">{value === null || value === undefined ? "—" : formatPercent(value)}</span>
          </Card>
        );
      })}
    </div>
  );
}

/** Of the players who installed on each day, how many came back 1, 2, 3, 7, 14 and 30 days later. */
export function RetentionPage() {
  const { selected } = useEnvironment();
  const envId = selected?.env.id ?? "";
  const [q, setQ] = useState<RetentionQuery>({ days: "30", build: "", platform: "" });
  const facets = useEventFacets(envId, "30d");
  const data = useRetention(envId, q);
  const opts = (all: string, list: { value: string }[] | undefined) => [{ value: "", label: all }, ...(list ?? []).map((f) => ({ value: f.value, label: f.value }))];

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">Retention</h1>
          <p className="text-muted">Players grouped by the day they first played. Averages only count cohorts old enough to have reached that day.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select aria-label="Starting build" size="sm" className="w-36" value={q.build} options={opts("All builds", facets.data?.builds)} onChange={(build) => setQ({ ...q, build })} />
          <Select aria-label="Platform" size="sm" className="w-36" value={q.platform} options={opts("All platforms", facets.data?.platforms)} onChange={(platform) => setQ({ ...q, platform })} />
          <Segmented label="Cohorts from the last" options={(["30", "60", "90"] as const).map((d) => ({ value: d, label: `${d}d` }))} value={q.days} onChange={(days) => setQ({ ...q, days })} />
        </div>
      </div>
      {data.isPending && <p className="text-muted">Loading cohorts…</p>}
      {data.isError && <p className="text-danger">{data.error.message}</p>}
      {data.data && <Summary data={data.data} />}
      <Card>
        <CardHeader title="Cohorts" action={<span className="text-xs text-muted">UTC days · · = not reached yet</span>} />
        {data.data?.cohorts.length === 0 && <EmptyState title="No new players in this range">Retention needs players' first events.</EmptyState>}
        {data.data && data.data.cohorts.length > 0 && <CohortGrid data={data.data} />}
      </Card>
    </div>
  );
}
