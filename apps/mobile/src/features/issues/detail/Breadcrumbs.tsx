import { Text, View } from "react-native";
import { Section } from "../../../components/data/Section.tsx";
import { relativeSeconds } from "./stack.ts";

type Crumb = { name: string; ts: string; message?: string | undefined; props?: Record<string, string | number | boolean | null> | undefined };

const props = (p: Crumb["props"]) =>
  p
    ? Object.entries(p)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ")
    : "";

/** The last few things the player did before it broke. */
export function Breadcrumbs({ crumbs, crashAt, type }: { crumbs: Crumb[]; crashAt: string; type: string }) {
  if (crumbs.length === 0) return null;
  const recent = crumbs.slice(-5);
  return (
    <Section title="Before it happened">
      <View className="mt-1.5 gap-2.5">
        {recent.map((c, i) => (
          <View key={`${c.ts}-${i}`} className="flex-row gap-3">
            <Text className="w-14 font-mono text-xs text-dim">{relativeSeconds(c.ts, crashAt)}</Text>
            <Text className="flex-1 font-mono text-[13px] text-[#c8c8c8]">
              {c.name} <Text className="text-dim">{c.message ?? props(c.props)}</Text>
            </Text>
          </View>
        ))}
        <View className="flex-row gap-3">
          <Text className="w-14 font-mono text-xs text-warn">0.0s</Text>
          <Text className="flex-1 font-mono text-[13px] text-fg">{type} thrown</Text>
        </View>
      </View>
    </Section>
  );
}
