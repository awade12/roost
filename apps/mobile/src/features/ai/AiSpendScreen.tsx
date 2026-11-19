import { Text, View } from "react-native";
import { Section } from "../../components/data/Section.tsx";
import { ErrorState, Loading } from "../../components/data/States.tsx";
import { StackScreen } from "../../components/layout/StackScreen.tsx";
import { formatCompact, formatNumber, formatUsd } from "../../lib/format.ts";
import { useWorkspace } from "../workspace/index.ts";
import { SpendBar } from "./SpendBar.tsx";
import { useAi } from "./use-ai.ts";

const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date());

function Row({ kind, name, detail, value, last }: { kind: string; name: string; detail: string; value: string; last: boolean }) {
  return (
    <View className={`flex-row items-center gap-3 py-3 ${last ? "" : "border-b border-border"}`}>
      <Text className="w-[52px] text-[11px] font-semibold tracking-wider text-muted">{kind}</Text>
      <View className="flex-1 gap-0.5">
        <Text className="font-mono text-sm font-medium text-fg">{name}</Text>
        <Text numberOfLines={1} className="text-xs text-dim">
          {detail}
        </Text>
      </View>
      <Text className="text-base font-semibold text-fg">{value}</Text>
    </View>
  );
}

export function AiSpendScreen() {
  const { game } = useWorkspace();
  const q = useAi(game?.id ?? null);
  const d = q.data;
  const kindOf = new Map<string, { kind: string; model: string }>([
    ...(d?.templates ?? []).map((t) => [t.name, { kind: "TEXT", model: t.model }] as const),
    ...(d?.decisions ?? []).map((t) => [t.name, { kind: "DECIDE", model: t.model }] as const),
    ...(d?.speech ?? []).map((t) => [t.name, { kind: "VOICE", model: t.model }] as const),
  ]);
  const rows = [...(d?.usage.byTemplate ?? [])].sort((a, b) => b.costUsd - a.costUsd);
  return (
    <StackScreen back="Live ops">
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {d ? (
        <>
          <View className="gap-1">
            <Text className="text-[15px] text-muted">AI spend · {monthName}</Text>
            <Text className="text-5xl font-semibold tracking-tighter text-fg">{formatUsd(d.usage.spendMonthUsd)}</Text>
            <Text className="text-sm text-muted">
              {formatNumber(d.usage.requests30d)} requests in 30 days · cap {formatUsd(d.limits.monthlyCapCents / 100)}
            </Text>
          </View>
          <SpendBar spentUsd={d.usage.spendMonthUsd} capUsd={d.limits.monthlyCapCents / 100} />
          <Section title="By template · 30 days">
            {rows.length === 0 ? <Text className="py-2 text-sm text-muted">No AI calls yet.</Text> : null}
            <View>
              {rows.map((r, i) => {
                const info = kindOf.get(r.template);
                return <Row key={r.template} kind={info?.kind ?? "—"} name={r.template} detail={`${info?.model ?? "deleted"} · ${formatCompact(r.requests)} calls`} value={formatUsd(r.costUsd)} last={i === rows.length - 1} />;
              })}
            </View>
          </Section>
          <Section title="Limits">
            <View>
              <View className="flex-row justify-between border-b border-border py-3">
                <Text className="text-[15px] text-fg">Monthly cap</Text>
                <Text className="text-[15px] text-muted">{formatUsd(d.limits.monthlyCapCents / 100)}</Text>
              </View>
              <View className="flex-row justify-between border-b border-border py-3">
                <Text className="text-[15px] text-fg">Per player, per day</Text>
                <Text className="text-[15px] text-muted">{formatCompact(d.limits.playerDailyTokens)} tokens</Text>
              </View>
              <View className="flex-row justify-between py-3">
                <Text className="text-[15px] text-fg">Per player, per minute</Text>
                <Text className="text-[15px] text-muted">{d.limits.playerPerMinute} calls</Text>
              </View>
            </View>
          </Section>
        </>
      ) : null}
    </StackScreen>
  );
}
