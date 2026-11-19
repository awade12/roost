import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Section } from "../../components/data/Section.tsx";
import { Empty, ErrorState, Loading } from "../../components/data/States.tsx";
import { TabScreen } from "../../components/layout/TabScreen.tsx";
import { formatUsd } from "../../lib/format.ts";
import { SpendBar, useAi } from "../ai/index.ts";
import { FlagRow, useFlags, useToggleFlag } from "../flags/index.ts";
import { TabHeader } from "../tabs/index.ts";
import { useWorkspace } from "../workspace/index.ts";

const SHOWN_FLAGS = 4;
const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date());

function Tile({ title, detail, href, live = false }: { title: string; detail: string; href: Href; live?: boolean }) {
  return (
    <Pressable onPress={() => router.push(href)} className="flex-1 gap-1 rounded-[14px] border border-border bg-panel p-3.5 active:opacity-80">
      <View className="flex-row items-center gap-1.5">
        {live ? <View className="h-[7px] w-[7px] rounded-full bg-ok" /> : null}
        <Text className="text-[15px] font-semibold text-fg">{title}</Text>
      </View>
      <Text className="text-[13px] text-muted">{detail}</Text>
    </Pressable>
  );
}

export function LiveOpsScreen() {
  const { game, environment } = useWorkspace();
  const queryClient = useQueryClient();
  const ai = useAi(game?.id ?? null);
  const flags = useFlags(environment?.id ?? null);
  const toggle = useToggleFlag(environment?.id ?? null);
  const shown = flags.data?.slice(0, SHOWN_FLAGS) ?? [];
  return (
    <TabScreen header={<TabHeader />} title="Live ops" onRefresh={() => queryClient.refetchQueries({ type: "active" })}>
      {!environment ? <Empty title="No game selected" body="Tap the game at the top to pick one." /> : null}
      {ai.data ? (
        <Pressable onPress={() => router.push("/live/ai")} className="gap-3 active:opacity-80">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm text-muted">AI spend · {monthName}</Text>
            <Text className="text-sm text-muted">Details</Text>
          </View>
          <View className="flex-row items-baseline gap-2">
            <Text className="text-[40px] font-semibold tracking-tighter text-fg">{formatUsd(ai.data.usage.spendMonthUsd)}</Text>
            <Text className="text-[15px] text-muted">of {formatUsd(ai.data.limits.monthlyCapCents / 100)} cap</Text>
          </View>
          <SpendBar spentUsd={ai.data.usage.spendMonthUsd} capUsd={ai.data.limits.monthlyCapCents / 100} />
        </Pressable>
      ) : null}
      {environment ? (
        <Section title="Flags" action={flags.data && flags.data.length > SHOWN_FLAGS ? { label: `All ${flags.data.length}`, onPress: () => router.push("/live/flags") } : undefined}>
          {flags.isLoading ? <Loading /> : null}
          {flags.error ? <ErrorState error={flags.error} onRetry={() => void flags.refetch()} /> : null}
          {flags.data?.length === 0 ? <Text className="py-2 text-sm text-muted">No flags yet. Add them in roost.config.json.</Text> : null}
          <View>
            {shown.map((f, i) => (
              <FlagRow key={f.id} flag={f} onToggle={toggle.mutateAsync} busy={toggle.isPending} last={i === shown.length - 1} />
            ))}
          </View>
        </Section>
      ) : null}
      {environment ? (
        <View className="flex-row gap-2.5">
          <Tile title="Live events" detail="Watch them arrive" href="/live/events" live />
          <Tile title="Players" detail="Look one up" href="/live/players" />
        </View>
      ) : null}
    </TabScreen>
  );
}
