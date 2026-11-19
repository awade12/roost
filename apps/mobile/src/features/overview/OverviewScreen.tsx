import { Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { StatRow } from "../../components/data/StatRow.tsx";
import { Empty, ErrorState, Loading } from "../../components/data/States.tsx";
import { TabScreen } from "../../components/layout/TabScreen.tsx";
import { formatChange, formatCompact, formatNumber, formatPercent, formatShortDay } from "../../lib/format.ts";
import { TabHeader } from "../tabs/index.ts";
import { useNavCounts, useWorkspace } from "../workspace/index.ts";
import { Attention } from "./components/Attention.tsx";
import { TrendChart } from "./components/TrendChart.tsx";
import { useOverview } from "./use-overview.ts";

const tone = (c: number | null) => (c === null || c === 0 ? "muted" : c > 0 ? "ok" : "danger");

function Body({ environmentId }: { environmentId: string }) {
  const overview = useOverview(environmentId);
  const counts = useNavCounts(environmentId);
  if (overview.isLoading) return <Loading />;
  if (overview.error || !overview.data) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  const { summary, d1, days, hasEvents } = overview.data;
  if (!hasEvents) return <Empty title="No events yet" body="Once the game sends its first events, players show up here." />;
  const players = days.map((d) => d.players);
  const current = players.slice(-30);
  // Nothing recorded before then (a new game): leave the comparison line out rather than draw it at zero.
  const previous = players.slice(-60, -30).some((n) => n > 0) ? players.slice(-60, -30) : [];
  const first = days[days.length - 30]?.day;
  const mid = days[days.length - 15]?.day;
  return (
    <View className="gap-6">
      <View className="gap-1.5">
        <Text className="text-[15px] text-muted">Daily players · 7-day average</Text>
        <View className="flex-row items-baseline gap-2.5">
          <Text className="text-[52px] font-semibold tracking-tighter text-fg" style={{ fontVariant: ["tabular-nums"] }}>
            {formatNumber(summary.players.value)}
          </Text>
          <Text className={`font-mono text-[15px] font-medium ${summary.players.change === null ? "text-dim" : summary.players.change >= 0 ? "text-ok" : "text-danger"}`}>{formatChange(summary.players.change)}</Text>
          <Text className="-ml-1 text-[13px] text-dim">vs last week</Text>
        </View>
      </View>
      <TrendChart current={current} previous={previous} labels={[first ? formatShortDay(first) : "", mid ? formatShortDay(mid) : "", "Today"]} />
      <StatRow
        stats={[
          { label: "New / day", value: formatCompact(summary.newPlayers.value), note: formatChange(summary.newPlayers.change), tone: tone(summary.newPlayers.change) },
          { label: "D1 retention", value: formatPercent(d1.rate) },
          { label: "Events / day", value: formatCompact(summary.events.value), note: formatChange(summary.events.change), tone: tone(summary.events.change) },
        ]}
      />
      <Attention environmentId={environmentId} openReports={counts.data?.reports.open ?? 0} />
    </View>
  );
}

export function OverviewScreen() {
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  return (
    <TabScreen header={<TabHeader />} onRefresh={() => queryClient.refetchQueries({ type: "active" })}>
      {ws.isLoading ? <Loading /> : null}
      {ws.error ? <ErrorState error={ws.error} onRetry={() => void ws.refetch()} /> : null}
      {!ws.isLoading && !ws.error && !ws.environment ? <Empty title="No games yet" body="Create a game in the Roost dashboard, then pull to refresh." /> : null}
      {ws.environment ? <Body environmentId={ws.environment.id} /> : null}
    </TabScreen>
  );
}
