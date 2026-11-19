import { router, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Section } from "../../../components/data/Section.tsx";
import { colors } from "../../../components/theme.ts";
import { formatAgo, formatCompact } from "../../../lib/format.ts";
import { useIssues } from "../../issues/index.ts";

type Item = { key: string; dot: string; title: string; detail: string; href: Href };

const NEW_FOR_MS = 7 * 86_400_000;

function Row({ item, last }: { item: Item; last: boolean }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(item.href)} className={`flex-row items-center gap-3 py-3 active:opacity-70 ${last ? "" : "border-b border-border"}`}>
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: item.dot }} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-[15px] font-medium text-fg">
          {item.title}
        </Text>
        <Text className="text-[13px] text-muted">{item.detail}</Text>
      </View>
      <Svg width={8} height={12} viewBox="0 0 8 12">
        <Path d="M2 2l4 4-4 4" stroke={colors.faint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Pressable>
  );
}

/** Regressed and brand-new issues first, then open bug reports. Hidden when all is quiet. */
export function Attention({ environmentId, openReports }: { environmentId: string; openReports: number }) {
  const issues = useIssues(environmentId, "unresolved").data ?? [];
  const now = Date.now();
  const items: Item[] = [
    ...issues.filter((i) => i.regressedAt).map((i) => ({ key: i.id, dot: colors.warn, title: `${i.type} regressed in ${i.lastBuild}`, detail: `${formatCompact(i.players)} players · ${formatAgo(i.lastSeenAt)}`, href: `/issue/${i.id}` as const })),
    ...issues
      .filter((i) => !i.regressedAt && now - new Date(i.firstSeenAt).getTime() < NEW_FOR_MS)
      .map((i) => ({ key: i.id, dot: colors.danger, title: `${i.type} is new`, detail: `${formatCompact(i.players)} players · first seen ${formatAgo(i.firstSeenAt)}`, href: `/issue/${i.id}` as const })),
  ].slice(0, 3);
  if (openReports > 0) items.push({ key: "reports", dot: colors.muted, title: `${openReports} open bug report${openReports === 1 ? "" : "s"}`, detail: "Read what players wrote", href: "/reports" });
  if (items.length === 0) return null;
  return (
    <Section title="Needs attention" action={{ label: "See issues", onPress: () => router.push("/issues") }}>
      <View>
        {items.map((item, i) => (
          <Row key={item.key} item={item} last={i === items.length - 1} />
        ))}
      </View>
    </Section>
  );
}
