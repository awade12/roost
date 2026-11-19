import * as Haptics from "expo-haptics";
import { Pressable, Text } from "react-native";

type Props = { label: string; selected?: boolean; onPress: () => void; mono?: boolean };

/** A filter pill. Selected is solid white, like the active tab. */
export function Chip({ label, selected = false, onPress, mono = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      className={`h-8 justify-center rounded-full px-[13px] ${selected ? "bg-fg" : "border border-border"}`}
    >
      <Text className={`${mono ? "font-mono text-[13px]" : "text-sm"} ${selected ? "font-semibold text-bg" : "text-muted"}`}>{label}</Text>
    </Pressable>
  );
}
