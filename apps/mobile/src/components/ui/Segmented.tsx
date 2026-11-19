import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

type Props<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void };

/** Two to four mutually exclusive views of one list. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View accessibilityRole="tablist" className="flex-row rounded-[10px] border border-border bg-panel p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(o.value);
            }}
            className={`flex-1 items-center rounded-[7px] py-[7px] ${on ? "bg-[#222222]" : ""}`}
          >
            <Text className={`text-sm ${on ? "font-semibold text-fg" : "font-medium text-muted"}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
