import Svg, { Circle, Path } from "react-native-svg";

type IconProps = { color: string; size?: number; bold?: boolean };

const w = (bold: boolean | undefined) => (bold ? 2.1 : 1.9);

export function OverviewIcon({ color, size = 23, bold }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20v-6M9.33 20V9M14.67 20v-8M20 20V5" stroke={color} strokeWidth={bold ? 2.4 : 2.1} strokeLinecap="round" />
    </Svg>
  );
}

export function IssuesIcon({ color, size = 23, bold }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={w(bold)} />
      <Path d="M12 7.5v5.5" stroke={color} strokeWidth={w(bold)} strokeLinecap="round" />
      <Circle cx={12} cy={16.2} r={1.15} fill={color} />
    </Svg>
  );
}

export function ReportsIcon({ color, size = 23, bold }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16h.5A1.5 1.5 0 0 1 5 14.5z" stroke={color} strokeWidth={w(bold)} strokeLinejoin="round" />
    </Svg>
  );
}

export function LiveOpsIcon({ color, size = 23, bold }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke={color} strokeWidth={w(bold)} strokeLinecap="round" />
      <Circle cx={15} cy={7} r={2.2} stroke={color} strokeWidth={w(bold)} />
      <Circle cx={9} cy={17} r={2.2} stroke={color} strokeWidth={w(bold)} />
    </Svg>
  );
}
