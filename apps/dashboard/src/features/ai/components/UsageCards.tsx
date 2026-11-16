import { Card } from "../../../components/ui/index.ts";
import { formatNumber, formatPercent, formatUsd } from "../../../lib/format.ts";
import type { AiData } from "../api/use-ai.ts";

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="text-muted">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      <span className="text-xs text-muted">{hint}</span>
    </Card>
  );
}

export function UsageCards({ data }: { data: AiData }) {
  const { usage, limits } = data;
  const cap = limits.monthlyCapCents / 100;
  const used = cap > 0 ? Math.min(usage.spendMonthUsd / cap, 1) : 0;
  return (
    <div className="grid grid-cols-4 gap-3">
      <Card className="flex flex-col gap-2 p-4">
        <span className="text-muted">OpenRouter spend this month</span>
        <span className="text-2xl font-semibold tracking-tight">{formatUsd(usage.spendMonthUsd)}</span>
        <div className="h-1 rounded-full bg-hover" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={usage.spendMonthUsd} aria-label="Spend against monthly cap">
          <div className={`h-full rounded-full ${used >= 0.9 ? "bg-warn" : "bg-fg"}`} style={{ width: `${used * 100}%` }} />
        </div>
        <span className="text-xs text-muted">of the {formatUsd(cap)} monthly cap</span>
      </Card>
      <Stat label="Requests" value={formatNumber(usage.requests30d)} hint="Last 30 days" />
      <Stat label="Median latency" value={usage.p50LatencyMs ? `${formatNumber(usage.p50LatencyMs)} ms` : "—"} hint="Successful calls, 30 days" />
      <Stat label="Blocked by limits" value={formatPercent(usage.blockedRate)} hint="Rate limit, budget or cap" />
    </div>
  );
}
