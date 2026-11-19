import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme.ts";

type Props = {
  back: string;
  /** Small centred text, e.g. "#142". */
  center?: string | undefined;
  children: ReactNode;
  /** Pinned to the bottom, e.g. an ActionBar. */
  footer?: ReactNode;
};

/** A pushed page: back button, scrolling content, optional pinned footer. */
export function StackScreen({ back, center, children, footer }: Props) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <View className="h-11 flex-row items-center justify-between pl-2.5 pr-4">
        <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${back}`} hitSlop={8} onPress={() => router.back()} className="flex-row items-center gap-0.5 active:opacity-70">
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path d="M15 5l-7 7 7 7" stroke={colors.fg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
          <Text className="text-[17px] text-fg">{back}</Text>
        </Pressable>
        {center ? <Text className="font-mono text-sm text-muted">{center}</Text> : null}
        <View className="w-16" />
      </View>
      <ScrollView contentContainerClassName={`gap-6 px-5 pt-3 ${footer ? "pb-32" : "pb-12"}`}>{children}</ScrollView>
      {footer}
    </SafeAreaView>
  );
}
