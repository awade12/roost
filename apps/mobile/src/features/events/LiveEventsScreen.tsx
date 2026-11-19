import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ErrorState, Loading } from "../../components/data/States.tsx";
import { StackScreen } from "../../components/layout/StackScreen.tsx";
import { Chip } from "../../components/ui/Chip.tsx";
import { useWorkspace } from "../workspace/index.ts";
import { propsLine, useEventStream } from "./use-event-stream.ts";

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(`${iso.replace(" ", "T")}Z`).getTime()) / 1000));
  return s < 2 ? "now" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
};

/** Events as they arrive, newest first. Pause to read; filter to one event name. */
export function LiveEventsScreen() {
  const { environment } = useWorkspace();
  const [live, setLive] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const q = useEventStream(environment?.id ?? null, name, live);
  const names = [...new Set((q.data ?? []).map((e) => e.name))].slice(0, 3);
  const footer = (
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-9 items-center">
      <Pressable onPress={() => setLive(!live)} className="h-11 flex-row items-center gap-2 rounded-full border border-[#2e2e2e] bg-raised px-[18px] active:opacity-80">
        <View className={`h-2 w-2 rounded-full ${live ? "bg-ok" : "bg-dim"}`} />
        <Text className="text-[15px] font-semibold text-fg">{live ? "Pause stream" : "Resume"}</Text>
      </Pressable>
    </View>
  );
  return (
    <StackScreen back="Live ops" footer={footer}>
      <View className="gap-1.5">
        <View className="flex-row items-center gap-2.5">
          <Text className="text-[34px] font-semibold tracking-tight text-fg">Live events</Text>
          {live ? (
            <View className="flex-row items-center gap-1.5 rounded-md bg-ok/15 px-2 py-1">
              <View className="h-1.5 w-1.5 rounded-full bg-ok" />
              <Text className="text-xs font-semibold text-ok">Live</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-[15px] text-muted">Last hour · {q.data?.length ?? 0} shown</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-2 px-5">
        <Chip label="All" selected={name === null} onPress={() => setName(null)} />
        {(name && !names.includes(name) ? [name, ...names] : names).map((n) => (
          <Chip key={n} label={n} mono selected={name === n} onPress={() => setName(n)} />
        ))}
      </ScrollView>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data?.length === 0 ? <Text className="text-sm text-muted">No events in the last hour.</Text> : null}
      <View className="-mt-2">
        {(q.data ?? []).map((e, i, all) => (
          <View key={e.id} className={`flex-row gap-3 py-2.5 ${i === all.length - 1 ? "" : "border-b border-border"}`}>
            <Text className={`w-[38px] pt-px font-mono text-xs ${i === 0 && live ? "text-ok" : "text-dim"}`}>{ago(e.occurred_at)}</Text>
            <View className="flex-1 gap-0.5">
              <Text className="font-mono text-sm font-medium text-fg">{e.name}</Text>
              {propsLine(e.props, e.value) ? <Text className="font-mono text-xs text-muted">{propsLine(e.props, e.value)}</Text> : null}
            </View>
            <Text numberOfLines={1} className="w-[76px] pt-px text-right font-mono text-xs text-dim">
              {e.player_id}
            </Text>
          </View>
        ))}
      </View>
    </StackScreen>
  );
}
