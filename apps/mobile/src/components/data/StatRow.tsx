import { Text, View } from "react-native";

export type Stat = { label: string; value: string; note?: string | undefined; tone?: "ok" | "danger" | "warn" | "muted" | undefined };

const tones = { ok: "text-ok", danger: "text-danger", warn: "text-warn", muted: "text-dim" } as const;

/** Two to three numbers between hairlines, printed on the page rather than boxed. */
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <View className="flex-row border-y border-border">
      {stats.map((s, i) => (
        <View key={s.label} className={`flex-1 gap-1 py-3.5 ${i > 0 ? "border-l border-border pl-4" : ""}`}>
          <Text className="text-[13px] text-muted">{s.label}</Text>
          <Text className="text-[22px] font-semibold tracking-tight text-fg" style={{ fontVariant: ["tabular-nums"] }}>
            {s.value}
          </Text>
          {s.note ? <Text className={`font-mono text-xs ${tones[s.tone ?? "muted"]}`}>{s.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}
