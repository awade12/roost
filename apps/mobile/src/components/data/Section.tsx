import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Props = { title: string; action?: { label: string; onPress: () => void } | undefined; children: ReactNode };

/** A titled block of a screen, with an optional text action on the right. */
export function Section({ title, action, children }: Props) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[17px] font-semibold text-fg">{title}</Text>
        {action ? (
          <Pressable hitSlop={8} onPress={action.onPress}>
            <Text className="text-sm text-muted">{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
