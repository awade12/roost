import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../../components/theme.ts";
import { formatAgo } from "../../lib/format.ts";
import type { ReportListItem } from "./use-reports.ts";

/** Paperclip-style marker: a mini screen when something is attached, a page when not. */
function Thumb({ attachments }: { attachments: number }) {
  return (
    <View className="h-[72px] w-[52px] items-center justify-center rounded-lg border border-border bg-panel">
      {attachments > 0 ? (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} stroke={colors.muted} strokeWidth={1.6} />
          <Circle cx={15.5} cy={9.5} r={1.6} fill={colors.muted} />
          <Path d="M4 17l5-5 4 4 2-2 5 4" stroke={colors.muted} strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      ) : (
        <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
          <Path d="M6 3.5h7l4 4V18a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 6 18z M13 3.5V8h4" stroke={colors.dim} strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      )}
      {attachments > 1 ? <Text className="absolute bottom-1 right-1.5 text-[10px] font-semibold text-muted">{attachments}</Text> : null}
    </View>
  );
}

/** The player's own words first; build, platform and age underneath. */
export function ReportRow({ report, last }: { report: ReportListItem; last: boolean }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/report/${report.id}`)} className={`flex-row gap-3.5 py-3.5 active:opacity-70 ${last ? "" : "border-b border-border"}`}>
      <Thumb attachments={report.attachmentCount} />
      <View className="flex-1 gap-1.5">
        <Text numberOfLines={3} className="text-[15px] leading-[21px] text-fg">
          “{report.message}”
        </Text>
        <Text className="font-mono text-xs text-dim">
          {report.build} · {report.platform} · {report.category} · {formatAgo(report.receivedAt)}
        </Text>
      </View>
    </Pressable>
  );
}
