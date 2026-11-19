import { Alert, Text, View } from "react-native";
import { Toggle } from "../../components/ui/Toggle.tsx";
import { errorMessage } from "../../lib/api-error.ts";
import { formatAgo } from "../../lib/format.ts";
import type { Flag } from "./use-flags.ts";

const preview = (v: unknown) => {
  const s = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
};

function detail(flag: Flag): string {
  const parts = [flag.rollout ? `${flag.rollout.percent}% of players get ${preview(flag.rollout.value)}` : flag.type];
  const overrides = Object.keys(flag.overrides).length;
  if (overrides) parts.push(`${overrides} override${overrides === 1 ? "" : "s"}`);
  parts.push(`changed ${formatAgo(flag.updatedAt)}`);
  return parts.join(" · ");
}

/** A boolean flag gets a switch for its default; other types show their value. */
export function FlagRow({ flag, onToggle, busy, last }: { flag: Flag; onToggle: (f: Flag) => Promise<unknown>; busy: boolean; last: boolean }) {
  const toggle = () =>
    onToggle(flag).catch((err: unknown) => Alert.alert("Couldn't change the flag", errorMessage(err)));
  return (
    <View className={`flex-row items-center gap-3 py-3 ${last ? "" : "border-b border-border"}`}>
      <View className="flex-1 gap-1">
        <Text className="font-mono text-sm font-medium text-fg">{flag.key}</Text>
        <Text numberOfLines={1} className="text-xs text-dim">
          {detail(flag)}
        </Text>
      </View>
      {flag.type === "boolean" ? (
        <Toggle label={flag.key} value={flag.value === true} onChange={() => void toggle()} disabled={busy} />
      ) : (
        <Text className="font-mono text-[13px] text-muted">{preview(flag.value)}</Text>
      )}
    </View>
  );
}
