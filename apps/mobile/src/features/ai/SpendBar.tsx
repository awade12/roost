import { Text, View } from "react-native";
import { formatUsd } from "../../lib/format.ts";
import { projectMonth } from "./use-ai.ts";

/** Spent so far (solid) and where the month is heading (hatched-looking tail), against the cap. */
export function SpendBar({ spentUsd, capUsd }: { spentUsd: number; capUsd: number }) {
  const projected = projectMonth(spentUsd);
  const pct = (n: number) => `${Math.min(100, capUsd > 0 ? (n / capUsd) * 100 : 0)}%` as const;
  const daysLeft = (() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate() - now.getUTCDate();
  })();
  const over = projected > capUsd;
  return (
    <View className="gap-1.5">
      <View className="h-2 flex-row overflow-hidden rounded-full bg-[#1c1c1c]">
        <View className="rounded-full bg-chart" style={{ width: pct(spentUsd) }} />
        <View className={`opacity-40 ${over ? "bg-warn" : "bg-chart"}`} style={{ width: pct(Math.max(0, projected - spentUsd)) }} />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-dim">
          {capUsd > 0 ? `${Math.round((spentUsd / capUsd) * 100)}% used` : "No cap"} · {daysLeft} days left
        </Text>
        <Text className={`text-xs ${over ? "text-warn" : "text-dim"}`}>on pace for {formatUsd(projected)}</Text>
      </View>
    </View>
  );
}
