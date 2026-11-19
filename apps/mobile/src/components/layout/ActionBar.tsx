import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Buttons pinned above the home indicator on detail screens. */
export function ActionBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="absolute inset-x-0 bottom-0 flex-row gap-2.5 border-t border-border bg-bg/95 px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      {children}
    </View>
  );
}
