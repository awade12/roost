import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { formatAgo, formatNumber } from "../../lib/format.ts";
import type { IssueListItem } from "./use-issues.ts";

const NEW_FOR_MS = 7 * 86_400_000;

export function IssueTag({ issue }: { issue: { regressedAt: string | null; firstSeenAt: string } }) {
  if (issue.regressedAt) {
    return (
      <View className="rounded bg-warn/15 px-1.5 py-0.5">
        <Text className="text-[11px] font-semibold text-warn">Regressed</Text>
      </View>
    );
  }
  if (Date.now() - new Date(issue.firstSeenAt).getTime() < NEW_FOR_MS) {
    return (
      <View className="rounded bg-danger/15 px-1.5 py-0.5">
        <Text className="text-[11px] font-semibold text-danger">New</Text>
      </View>
    );
  }
  return null;
}

/** Type, message and where it was seen on the left; the 24-hour count in a fixed lane on the right. */
export function IssueRow({ issue, last }: { issue: IssueListItem; last: boolean }) {
  // Quiet for a day: the all-time count says more than a zero.
  const recent = issue.last24h > 0;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/issue/${issue.id}`)} className={`flex-row gap-3.5 py-3.5 active:opacity-70 ${last ? "" : "border-b border-border"}`}>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink font-mono text-[15px] font-semibold text-fg">
            {issue.type}
          </Text>
          <IssueTag issue={issue} />
        </View>
        <Text numberOfLines={2} className="text-sm leading-5 text-[#b4b4b4]">
          {issue.message}
        </Text>
        <Text className="font-mono text-xs text-dim">
          #{issue.number} · {issue.lastBuild} · {formatAgo(issue.lastSeenAt)}
        </Text>
      </View>
      <View className="w-[72px] items-end gap-1">
        <Text className="text-[17px] font-semibold tracking-tight text-fg" style={{ fontVariant: ["tabular-nums"] }}>
          {formatNumber(recent ? issue.last24h : issue.events)}
        </Text>
        <Text numberOfLines={1} className="text-[11px] text-dim">
          {recent ? "events · 24h" : "events"}
        </Text>
      </View>
    </Pressable>
  );
}
