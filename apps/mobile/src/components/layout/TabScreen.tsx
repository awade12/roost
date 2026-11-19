import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme.ts";

type Props = {
  header: ReactNode;
  title?: string | undefined;
  /** Small mono text after the title, e.g. "14 open". */
  count?: string | undefined;
  children: ReactNode;
  /** Pull to refresh; the spinner stays until the promise settles. */
  onRefresh?: () => Promise<unknown>;
};

/** A tab's page: header, optional large title, scrolling content that clears the floating tab bar. */
export function TabScreen({ header, title, count, children, onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? () => {
        setRefreshing(true);
        void onRefresh().finally(() => setRefreshing(false));
      }
    : undefined;
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      {header}
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-40 pt-6"
        refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} /> : undefined}
      >
        {title ? (
          <View className="flex-row items-baseline gap-2.5">
            <Text className="text-[34px] font-semibold tracking-tight text-fg">{title}</Text>
            {count ? <Text className="font-mono text-[15px] text-muted">{count}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
