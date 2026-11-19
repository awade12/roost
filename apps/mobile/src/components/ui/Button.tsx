import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, Text } from "react-native";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
};

const styles = {
  primary: { box: "bg-fg", text: "text-bg" },
  secondary: { box: "border border-border bg-panel", text: "text-fg" },
  danger: { box: "border border-border bg-panel", text: "text-danger" },
} as const;

export function Button({ label, onPress, variant = "primary", disabled = false, loading = false }: Props) {
  const style = styles[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      className={`h-12 flex-row items-center justify-center rounded-xl px-4 active:opacity-80 ${style.box} ${off ? "opacity-50" : ""}`}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? "#0a0a0a" : "#ededed"} /> : <Text className={`text-[15px] font-semibold ${style.text}`}>{label}</Text>}
    </Pressable>
  );
}
