import { formatNumber, formatShortDay } from "../../../lib/format.ts";
import type { RetentionData } from "../api/use-retention.ts";

/**
 * Sequential, single hue: the share retained sets how strong the chart blue is. Text stays in
 * the normal text color, and the value is printed, so color is never the only signal.
 */
function Cell({ retained, size }: { retained: number | undefined; size: number }) {
  if (retained === undefined || size === 0) return <td className="h-8 px-1 text-center text-[11px] text-faint">·</td>;
  const share = retained / size;
  return (
    <td className="h-8 px-0.5" title={`${formatNumber(retained)} of ${formatNumber(size)} players`}>
      <div className="flex h-7 items-center justify-center rounded font-mono text-[11px]" style={{ backgroundColor: `color-mix(in srgb, var(--color-chart) ${Math.round(8 + share * 72)}%, transparent)` }}>
        {(share * 100).toFixed(share < 0.1 && share > 0 ? 1 : 0)}%
      </div>
    </td>
  );
}

export function CohortGrid({ data }: { data: RetentionData }) {
  const offsets = data.days.filter((d) => d > 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-0.5 text-xs">
        <caption className="sr-only">Players retained N days after install, by install day</caption>
        <thead>
          <tr className="text-muted">
            <th className="px-4 py-2 text-left font-medium">Installed</th>
            <th className="px-2 py-2 text-right font-medium">Players</th>
            {offsets.map((d) => (
              <th key={d} className="px-1 py-2 text-center font-medium">
                D{d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.cohorts.map((c) => (
            <tr key={c.day}>
              <td className="px-4 whitespace-nowrap text-muted">{formatShortDay(c.day)}</td>
              <td className="px-2 text-right font-mono">{formatNumber(c.size)}</td>
              {offsets.map((d) => (
                <Cell key={d} retained={c.retained[d]} size={c.size} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
