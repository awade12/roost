import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "../../../components/theme.ts";
import { chartPaths } from "./chart-paths.ts";

type Props = { current: number[]; previous: number[]; labels: [string, string, string] };

const HEIGHT = 112;

/** This period as a blue line with a soft fill; the period before as a dashed grey line. */
export function TrendChart({ current, previous, labels }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const p = width > 0 ? chartPaths(current, previous, width, HEIGHT) : null;
  return (
    <View className="gap-2" onLayout={onLayout} accessibilityLabel="Daily players over the last 30 days compared with the 30 days before">
      <View style={{ height: HEIGHT }}>
        {p ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.chart} stopOpacity={0.22} />
                <Stop offset="1" stopColor={colors.chart} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={width} y1={HEIGHT * f} y2={HEIGHT * f} stroke="#1c1c1c" strokeWidth={1} />
            ))}
            {p.previous ? <Path d={p.previous} stroke={colors.faint} strokeWidth={1.5} strokeDasharray="3 3" fill="none" /> : null}
            <Path d={p.area} fill="url(#fill)" />
            <Path d={p.line} stroke={colors.chart} strokeWidth={2} strokeLinejoin="round" fill="none" />
            <Circle cx={p.end.x} cy={p.end.y} r={3.5} fill={colors.bg} stroke={colors.chart} strokeWidth={2} />
          </Svg>
        ) : null}
      </View>
      <View className="flex-row justify-between">
        {labels.map((l) => (
          <Text key={l} className="font-mono text-[11px] text-dim">
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}
