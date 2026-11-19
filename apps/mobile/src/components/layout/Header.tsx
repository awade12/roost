import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme.ts";

type Props = { game: string | null; environment: string | null; initial: string };

const short = (env: string) => (env.toLowerCase() === "production" ? "prod" : env.toLowerCase() === "development" ? "dev" : env);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Game pill (opens the switcher) and avatar (opens Account). Shown on every tab. */
export function Header({ game, environment, initial }: Props) {
  return (
    <View className="flex-row items-center justify-between px-5 pt-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch game"
        onPress={() => router.push("/switch-game")}
        className="h-9 flex-row items-center gap-2 rounded-full border border-border bg-panel pl-1.5 pr-3 active:opacity-80"
      >
        <View className="h-6 w-6 items-center justify-center rounded-full bg-fg">
          <Text className="text-[11px] font-bold text-bg">{game ? initials(game) : "–"}</Text>
        </View>
        <Text className="text-[15px] font-medium text-fg">{game ?? "No game"}</Text>
        {environment ? (
          <View className="flex-row items-center gap-1.5">
            <View className={`h-1.5 w-1.5 rounded-full ${environment.toLowerCase() === "production" ? "bg-ok" : "bg-warn"}`} />
            <Text className="text-sm text-muted">{short(environment)}</Text>
          </View>
        ) : null}
        <Svg width={10} height={10} viewBox="0 0 10 10">
          <Path d="M2.5 4l2.5 2.5L7.5 4" stroke={colors.muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account"
        onPress={() => router.push("/account")}
        className="h-9 w-9 items-center justify-center rounded-full border border-border bg-raised active:opacity-80"
      >
        <Text className="text-sm font-semibold text-fg">{initial}</Text>
      </Pressable>
    </View>
  );
}
