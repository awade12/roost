import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Section } from "../../components/data/Section.tsx";
import { StatRow } from "../../components/data/StatRow.tsx";
import { ErrorState, Loading } from "../../components/data/States.tsx";
import { StackScreen } from "../../components/layout/StackScreen.tsx";
import { colors } from "../../components/theme.ts";
import { formatAgo, formatNumber, parseTime } from "../../lib/format.ts";
import { useWorkspace } from "../workspace/index.ts";
import { usePlayer } from "./use-players.ts";

type Entry = { key: string; at: Date; dot: string; title: string; detail: string; href?: `/issue/${string}` | `/report/${string}` };

const ONLINE_MS = 5 * 60_000;

/** One player's story: who they are, then crashes and reports on one timeline. */
export function PlayerScreen({ playerId }: { playerId: string }) {
  const { environment } = useWorkspace();
  const q = usePlayer(environment?.id ?? null, playerId);
  const d = q.data;
  const entries: Entry[] = d
    ? [
        ...d.profile.crashes.map((c) => ({ key: c.id, at: parseTime(c.occurred_at), dot: colors.warn, title: `Crashed: ${c.type}${c.issueNumber ? ` #${c.issueNumber}` : ""}`, detail: `${c.build} · ${formatAgo(c.occurred_at)}`, href: `/issue/${c.issue_id}` as const })),
        ...d.reports.map((r) => ({ key: r.id, at: parseTime(r.receivedAt), dot: colors.muted, title: "Sent a bug report", detail: `“${r.message.slice(0, 40)}${r.message.length > 40 ? "…" : ""}” · ${formatAgo(r.receivedAt)}`, href: `/report/${r.id}` as const })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime())
    : [];
  const online = d ? Date.now() - parseTime(d.profile.lastSeen).getTime() < ONLINE_MS : false;
  return (
    <StackScreen back="Players">
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {d ? (
        <>
          <View className="gap-1.5">
            <View className="flex-row items-center gap-2">
              <View className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-dim"}`} />
              <Text className={`text-[13px] font-medium ${online ? "text-ok" : "text-muted"}`}>{online ? "Playing now" : `Last seen ${formatAgo(d.profile.lastSeen)}`}</Text>
            </View>
            <Text selectable className="font-mono text-[28px] font-semibold tracking-tight text-fg">
              {d.profile.playerId}
            </Text>
            <Text className="text-[15px] text-muted">
              {d.profile.platform} · {d.profile.build} · first seen {formatAgo(d.profile.firstSeen)}
            </Text>
          </View>
          <StatRow
            stats={[
              { label: "sessions", value: formatNumber(d.profile.sessions) },
              { label: "days active", value: formatNumber(d.profile.daysActive) },
              { label: "crashes", value: formatNumber(d.profile.crashes.length), tone: d.profile.crashes.length ? "warn" : undefined },
            ]}
          />
          <Section title="Timeline">
            {entries.length === 0 ? <Text className="py-2 text-sm text-muted">No crashes or reports from this player.</Text> : null}
            <View className="mt-2">
              {entries.map((e, i) => (
                <Pressable key={e.key} disabled={!e.href} onPress={() => e.href && router.push(e.href)} className="flex-row gap-3.5 active:opacity-70">
                  <View className="w-3.5 items-center">
                    <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.dot }} />
                    {i < entries.length - 1 ? <View className="w-[1.5px] flex-1 bg-border" /> : null}
                  </View>
                  <View className="flex-1 gap-0.5 pb-[18px]">
                    <Text className="text-[15px] font-medium text-fg">{e.title}</Text>
                    <Text className="text-[13px] text-muted">{e.detail}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Section>
        </>
      ) : null}
    </StackScreen>
  );
}
