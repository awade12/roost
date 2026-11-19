import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../components/theme.ts";
import { useNavCounts, useWorkspace } from "../workspace/index.ts";
import { IssuesIcon, LiveOpsIcon, OverviewIcon, ReportsIcon } from "./icons.tsx";

const TABS = {
  index: { label: "Overview", Icon: OverviewIcon },
  issues: { label: "Issues", Icon: IssuesIcon },
  reports: { label: "Reports", Icon: ReportsIcon },
  live: { label: "Live ops", Icon: LiveOpsIcon },
} as const;

type TabName = keyof typeof TABS;
const isTab = (name: string): name is TabName => name in TABS;

/** The parts of Expo Router's tab bar props we use, so we don't depend on its types directly. */
type Props = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
};

/**
 * A floating pill instead of a full-width bar: icons only, with the label shown on the
 * current tab. The page fades out underneath so content never ends at a hard edge.
 */
export function TabBar({ state, navigateToTab }: Props) {
  const insets = useSafeAreaInsets();
  const { environment } = useWorkspace();
  const regressed = (useNavCounts(environment?.id ?? null).data?.issues.regressed ?? 0) > 0;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0 items-center" style={{ paddingBottom: Math.max(insets.bottom, 12) + 6 }}>
      <LinearGradient pointerEvents="none" colors={["rgba(10,10,10,0)", "rgba(10,10,10,0.92)", colors.bg]} locations={[0, 0.55, 1]} className="absolute inset-x-0 bottom-0 h-[150px]" />
      <View className="flex-row items-center gap-1 rounded-full border border-white/10 bg-[#1e1e20] p-1.5" style={{ shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 12 } }}>
        {state.routes.filter((r) => isTab(r.name)).map((route) => {
          // Filtered by isTab above; TS can't carry that through the callback.
          const tab = TABS[route.name as TabName];
          const focused = state.routes[state.index]?.key === route.key;
          const press = () => {
            if (focused) return;
            void Haptics.selectionAsync();
            navigateToTab(route.key);
          };
          return focused ? (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: true }} onPress={press} className="h-12 flex-row items-center gap-2 rounded-full bg-fg pl-3.5 pr-[18px]">
              <tab.Icon color={colors.bg} size={22} bold />
              <Text className="text-[15px] font-semibold text-bg">{tab.label}</Text>
            </Pressable>
          ) : (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: false }} onPress={press} className="h-12 w-[52px] items-center justify-center rounded-full active:bg-white/5">
              <tab.Icon color="#9a9a9a" />
              {route.name === "issues" && regressed ? <View className="absolute right-[11px] top-[9px] h-[9px] w-[9px] rounded-full border-2 border-[#1e1e20] bg-warn" /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
