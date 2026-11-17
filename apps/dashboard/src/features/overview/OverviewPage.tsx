import { useState } from "react";
import { AreaChart } from "../../components/charts/AreaChart.tsx";
import { Card, CardHeader } from "../../components/ui/index.ts";
import { Segmented } from "../../components/ui/index.ts";
import { formatNumber, formatPercent } from "../../lib/format.ts";
import { useEnvironment } from "../studio/index.ts";
import { useOverview, type OverviewData, type Range } from "./api/use-overview.ts";
import { GetStarted } from "./components/GetStarted.tsx";
import { MetricCard } from "./components/MetricCard.tsx";
import { TopEvents } from "./components/TopEvents.tsx";

const RANGES = [7, 30, 90].map((d) => ({ value: d as Range, label: `${d}d` }));

function Metrics({ data }: { data: OverviewData | undefined }) {
  const s = data?.hasEvents ? data.summary : undefined;
  const d1 = data?.hasEvents ? data.d1 : undefined;
  return (
    <div className="grid grid-cols-4 gap-3">
      <MetricCard label="Daily active players" value={s && formatNumber(s.players.value)} change={s?.players.change} hint="7-day average" />
      <MetricCard label="New players / day" value={s && formatNumber(s.newPlayers.value)} change={s?.newPlayers.change} hint="7-day average" />
      <MetricCard
        label="D1 retention"
        value={d1?.rate == null ? undefined : formatPercent(d1.rate)}
        hint={d1 && d1.cohort > 0 ? `${formatNumber(d1.retained)} of ${formatNumber(d1.cohort)} came back next day` : undefined}
      />
      <MetricCard label="Events / day" value={s && formatNumber(s.events.value)} change={s?.events.change} hint="7-day average" />
    </div>
  );
}

function Charts({ data }: { data: OverviewData }) {
  const series = (key: "players" | "newPlayers") => data.days.map((d) => ({ day: d.day, value: d[key] }));
  const note = <span className="text-xs text-muted">UTC days · today so far is dashed</span>;
  return (
    <>
      <Card>
        <CardHeader title="Daily active players" action={note} />
        <div className="px-4 pt-4 pb-2">
          <AreaChart data={series("players")} label="Daily active players" partialLast />
        </div>
      </Card>
      <div className="grid grid-cols-5 gap-3">
        <Card className="col-span-3">
          <CardHeader title="New players" />
          <div className="px-4 pt-4 pb-2">
            <AreaChart data={series("newPlayers")} label="New players" partialLast height={180} />
          </div>
        </Card>
        <div className="col-span-2">
          <TopEvents events={data.topEvents} />
        </div>
      </div>
    </>
  );
}

export function OverviewPage() {
  const [days, setDays] = useState<Range>(30);
  const { games, selected } = useEnvironment();
  const overview = useOverview(selected?.env.id ?? null, days);
  const data = overview.data;

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <div className="flex items-center justify-end">
        <Segmented label="Date range" options={RANGES} value={days} onChange={setDays} />
      </div>
      {overview.isError && <p className="text-danger">{overview.error.message}</p>}
      <Metrics data={data} />
      {(games.isPending || (selected && overview.isPending)) && <p className="text-muted">Loading…</p>}
      {data?.hasEvents ? <Charts data={data} /> : (!selected || data) && <GetStarted gameId={selected?.game.id} />}
    </div>
  );
}
