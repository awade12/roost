import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatCompact, formatHour, formatLongDay, formatLongHour, formatNumber, formatShortDay } from "../../lib/format.ts";
import { xLabelIndexes, yTicks } from "./scale.ts";
import { useWidth } from "./use-width.ts";

/** `day` is "YYYY-MM-DD" for daily charts, or an ISO timestamp for hourly ones. */
type Point = { day: string; value: number };
type Unit = "day" | "hour";
const SHORT: Record<Unit, (k: string) => string> = { day: formatShortDay, hour: formatHour };
const LONG: Record<Unit, (k: string) => string> = { day: formatLongDay, hour: (k) => `${formatLongHour(k)} UTC` };
type Props = {
  data: Point[];
  /** What the value is, for the tooltip and the screen-reader table. */
  label: string;
  /** Draw the last segment dashed: the last day is still in progress. */
  partialLast?: boolean;
  height?: number;
  /** Buckets are days (default) or hours. */
  unit?: Unit;
};

const PAD = { top: 8, right: 8, bottom: 24, left: 40 };

/** Pixel mapping for one chart size. */
function geometry(data: Point[], width: number, height: number) {
  const ticks = yTicks(Math.max(...data.map((d) => d.value), 1));
  const top = ticks.at(-1) ?? 1;
  const plotW = Math.max(width - PAD.left - PAD.right, 0);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  return { ticks, plotW, plotH, x, y };
}
type Geo = ReturnType<typeof geometry>;

function Axes({ data, geo, width, height, unit }: { data: Point[]; geo: Geo; width: number; height: number; unit: Unit }) {
  const last = data.length - 1;
  return (
    <>
      {geo.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} className="stroke-border" />
          <text x={PAD.left - 8} y={geo.y(t) + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">
            {formatCompact(t)}
          </text>
        </g>
      ))}
      {xLabelIndexes(data.length).map((i) => (
        <text key={i} x={geo.x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-muted font-mono text-[11px]">
          {SHORT[unit](data[i]?.day ?? "")}
        </text>
      ))}
    </>
  );
}

function Series({ data, geo, partialLast }: { data: Point[]; geo: Geo; partialLast: boolean }) {
  const pts = data.map((d, i) => `${geo.x(i).toFixed(1)},${geo.y(d.value).toFixed(1)}`);
  const area = `M${pts.join(" L")} L${geo.x(data.length - 1)},${geo.y(0)} L${geo.x(0)},${geo.y(0)} Z`;
  return (
    <>
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="[stop-color:var(--color-chart)]" stopOpacity="0.22" />
          <stop offset="1" className="[stop-color:var(--color-chart)]" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#area-fill)" />
      <polyline points={(partialLast ? pts.slice(0, -1) : pts).join(" ")} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-chart" />
      {partialLast && pts.length > 1 && (
        <polyline points={pts.slice(-2).join(" ")} fill="none" strokeWidth="2" strokeDasharray="4 4" className="stroke-chart" />
      )}
    </>
  );
}

function Tooltip({ point, left, flip, partial, unit }: { point: Point; left: number; flip: boolean; partial: boolean; unit: Unit }) {
  return (
    <div
      className="pointer-events-none absolute top-1 rounded-md border border-border bg-bg px-2.5 py-1.5 shadow-lg"
      // Position follows the pointer, so it can't be a static Tailwind class.
      style={{ left, transform: `translateX(${flip ? "calc(-100% - 10px)" : "10px"})` }}
    >
      <p className="font-mono text-sm font-semibold">{formatNumber(point.value)}</p>
      <p className="text-xs text-muted">
        {LONG[unit](point.day)}
        {partial ? " · so far" : ""}
      </p>
    </div>
  );
}

/** Single-series daily area chart with a crosshair + tooltip (pointer and arrow keys). */
export function AreaChart({ data, label, partialLast = false, height = 220, unit = "day" }: Props) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const geo = geometry(data, width, height);
  const last = data.length - 1;
  const clamp = (i: number) => Math.min(Math.max(i, 0), last);
  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(clamp(Math.round(((e.clientX - box.left) / box.width) * last)));
  };
  const step = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => clamp((h ?? last) + (e.key === "ArrowLeft" ? -1 : 1)));
  };
  const point = hover === null ? undefined : data[hover];

  return (
    <div ref={ref} className="relative outline-none focus-visible:ring-1 focus-visible:ring-muted" tabIndex={0} aria-label={`${label} chart. Use the arrow keys to read values.`} onKeyDown={step} onBlur={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} className="block" aria-hidden>
          <Axes data={data} geo={geo} width={width} height={height} unit={unit} />
          <Series data={data} geo={geo} partialLast={partialLast} />
          {point && hover !== null && (
            <>
              <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={geo.y(0)} className="stroke-faint" />
              <circle cx={geo.x(hover)} cy={geo.y(point.value)} r="4" strokeWidth="2" className="fill-chart stroke-panel" />
            </>
          )}
          <rect x={PAD.left} y={PAD.top} width={geo.plotW} height={geo.plotH} fill="transparent" onPointerMove={pick} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {point && hover !== null && <Tooltip point={point} left={geo.x(hover)} flip={hover > data.length / 2} partial={partialLast && hover === last} unit={unit} />}
      <table className="sr-only">
        <caption>{label} by {unit}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
