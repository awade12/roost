import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { ErrorState, Loading } from "../../components/data/States.tsx";
import { StackScreen } from "../../components/layout/StackScreen.tsx";
import { colors } from "../../components/theme.ts";
import { formatAgo } from "../../lib/format.ts";
import { useWorkspace } from "../workspace/index.ts";
import { usePlayers } from "./use-players.ts";

/** Search players seen in the last 30 days by ID; most recent first. */
export function PlayersScreen() {
  const { environment } = useWorkspace();
  const [q, setQ] = useState("");
  const players = usePlayers(environment?.id ?? null, q.trim());
  return (
    <StackScreen back="Live ops" center="Players">
      <View className="h-11 flex-row items-center gap-2.5 rounded-xl border border-border bg-panel px-3.5">
        <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
          <Circle cx={8} cy={8} r={5.5} stroke={colors.muted} strokeWidth={1.7} />
          <Path d="M12.2 12.2L16 16" stroke={colors.muted} strokeWidth={1.7} strokeLinecap="round" />
        </Svg>
        <TextInput value={q} onChangeText={setQ} placeholder="Player ID" placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} className="flex-1 font-mono text-[15px] text-fg" />
      </View>
      {players.isLoading ? <Loading /> : null}
      {players.error ? <ErrorState error={players.error} onRetry={() => void players.refetch()} /> : null}
      {players.data?.length === 0 ? <Text className="text-sm text-muted">No players match.</Text> : null}
      <View className="-mt-2">
        {(players.data ?? []).map((p, i, all) => (
          <Pressable key={p.player_id} onPress={() => router.push(`/live/player/${encodeURIComponent(p.player_id)}`)} className={`flex-row items-center gap-3 py-3 active:opacity-70 ${i === all.length - 1 ? "" : "border-b border-border"}`}>
            <View className="flex-1 gap-0.5">
              <Text className="font-mono text-[15px] text-fg">{p.player_id}</Text>
              <Text className="text-xs text-dim">
                {p.last_platform} · {p.last_build} · {p.sessions} session{p.sessions === 1 ? "" : "s"}
              </Text>
            </View>
            <Text className="text-xs text-muted">{formatAgo(p.last_seen)}</Text>
          </Pressable>
        ))}
      </View>
    </StackScreen>
  );
}
