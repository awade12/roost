import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";

type Props = { value: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string };

/** An iOS-style switch drawn to match the app; `label` is for screen readers. */
export function Toggle({ value, onChange, disabled = false, label }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onChange(!value);
      }}
      className={`h-[31px] w-[51px] justify-center rounded-full p-[2px] ${value ? "items-end bg-ok" : "items-start bg-[#2a2a2a]"} ${disabled ? "opacity-50" : ""}`}
    >
      <View className="h-[27px] w-[27px] rounded-full bg-white" />
    </Pressable>
  );
}
