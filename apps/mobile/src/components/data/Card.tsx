import type { ReactNode } from "react";
import { Text, View } from "react-native";

/** A bordered panel with an optional small heading. */
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-panel p-4">
      {title ? <Text className="text-[13px] font-medium text-muted">{title}</Text> : null}
      {children}
    </View>
  );
}
