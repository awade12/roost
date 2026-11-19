import { useRef, type ComponentRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const LENGTH = 6;

/**
 * Six boxes over one hidden input, so paste and iOS's "From Messages" autofill fill the
 * whole code at once. The box being typed into is outlined in blue.
 */
export function CodeBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable accessibilityRole="none" onPress={() => input.current?.focus()} className="flex-row gap-2">
      {Array.from({ length: LENGTH }, (_, i) => {
        const digit = value[i];
        const active = i === Math.min(value.length, LENGTH - 1) && !disabled;
        return (
          <View key={i} className={`h-[60px] flex-1 items-center justify-center rounded-xl bg-panel ${active ? "border-[1.5px] border-chart" : digit ? "border border-[#3a3a3a]" : "border border-border"}`}>
            {digit ? <Text className="font-mono text-[26px] font-medium text-fg">{digit}</Text> : active ? <View className="h-[26px] w-0.5 bg-chart" /> : null}
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        editable={!disabled}
        accessibilityLabel="Sign-in code"
        caretHidden
        className="absolute inset-0 text-transparent opacity-[0.02]"
      />
    </Pressable>
  );
}
