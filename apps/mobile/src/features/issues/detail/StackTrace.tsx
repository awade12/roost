import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Section } from "../../../components/data/Section.tsx";
import { stackLines } from "./stack.ts";

const SHOWN = 4;

/** The latest event's stack, top frames first; the rest behind a tap. */
export function StackTrace({ stack, type }: { stack: string; type: string }) {
  const [open, setOpen] = useState(false);
  const lines = stackLines(stack, type);
  if (lines.length === 0) return null;
  const shown = open ? lines : lines.slice(0, SHOWN);
  return (
    <Section title="Stack trace">
      <View className="mt-1.5 overflow-hidden rounded-xl border border-border bg-panel">
        {shown.map((line, i) => (
          <View key={`${i}-${line}`} className={`flex-row gap-2.5 px-3.5 py-2.5 ${i ? "border-t border-border" : ""}`}>
            <View className={`w-[3px] rounded-sm ${i === 0 ? "bg-warn" : ""}`} />
            <Text selectable className={`flex-1 font-mono text-[12.5px] leading-[18px] ${i === 0 ? "font-semibold text-fg" : "text-[#c8c8c8]"}`}>
              {line}
            </Text>
          </View>
        ))}
        {lines.length > SHOWN ? (
          <Pressable onPress={() => setOpen(!open)} className="border-t border-border px-3.5 py-2.5 active:bg-white/5">
            <Text className="pl-[13px] font-mono text-xs text-dim">{open ? "Show less" : `+ ${lines.length - SHOWN} more lines`}</Text>
          </Pressable>
        ) : null}
      </View>
    </Section>
  );
}
