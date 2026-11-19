import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../../components/theme.ts";
import { Segmented } from "../../../components/ui/Segmented.tsx";
import { pickEnvironment } from "../pick.ts";
import { useWorkspace } from "../WorkspaceProvider.tsx";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Bottom sheet: pick a game, then its environment. Picking a game keeps you on its production. */
export function GameSwitcher() {
  const { org, games, game, environment, select } = useWorkspace();
  const choose = (environmentId: string) => {
    void Haptics.selectionAsync();
    if (org) select(org.id, environmentId);
  };
  return (
    <View className="flex-1 gap-4 bg-[#141414] pt-6">
      <View className="flex-row items-baseline justify-between px-5">
        <Text className="text-xl font-semibold text-fg">Switch game</Text>
        {org ? <Text className="text-sm text-muted">{org.name}</Text> : null}
      </View>
      <View className="px-3">
        {games.map((g) => {
          const on = g.id === game?.id;
          const target = pickEnvironment([g], { orgId: null, environmentId: null })?.environment;
          return (
            <Pressable
              key={g.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !target }}
              disabled={!target}
              onPress={() => {
                if (target) choose(target.id);
                router.back();
              }}
              className={`flex-row items-center gap-3 rounded-[14px] p-3 ${on ? "bg-raised" : "active:bg-white/5"} ${target ? "" : "opacity-50"}`}
            >
              <View className={`h-10 w-10 items-center justify-center rounded-[10px] ${on ? "bg-fg" : "bg-[#262626]"}`}>
                <Text className={`text-sm font-bold ${on ? "text-bg" : "text-fg"}`}>{initials(g.name)}</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-semibold text-fg">{g.name}</Text>
                <Text className="text-[13px] text-muted">{g.environments.length ? g.environments.map((e) => e.name).join(" · ") : "No environments yet"}</Text>
              </View>
              {on ? (
                <Svg width={20} height={20} viewBox="0 0 20 20">
                  <Path d="M4.5 10.5l3.5 3.5 7.5-8" stroke={colors.fg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </Svg>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {game && environment && game.environments.length > 1 ? (
        <View className="gap-2.5 px-5">
          <Text className="text-[13px] font-medium text-muted">Environment</Text>
          <Segmented options={game.environments.map((e) => ({ value: e.id, label: e.name }))} value={environment.id} onChange={choose} />
        </View>
      ) : null}
    </View>
  );
}
