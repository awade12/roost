import { Card } from "../../../components/ui/index.ts";
import { formatChange } from "../../../lib/format.ts";

type Props = { label: string; value?: string | undefined; change?: number | null | undefined; hint?: string | undefined };

/** One headline number with week-over-week change. Without a value: a dash and "No data yet". */
export function MetricCard({ label, value, change, hint }: Props) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="text-muted">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value ?? "—"}</span>
        {value !== undefined && change != null && (
          <span className={`font-mono text-xs ${change >= 0 ? "text-ok" : "text-danger"}`}>{formatChange(change)}</span>
        )}
        {value === undefined && <span className="text-xs text-muted">No data yet</span>}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Card>
  );
}
