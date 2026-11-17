import { Card, CardHeader } from "../../../components/ui/index.ts";
import { EmptyState } from "../../../components/ui/index.ts";
import { formatNumber, formatUsd } from "../../../lib/format.ts";
import type { AiData } from "../api/use-ai.ts";

/** Decision templates, read-only: they're edited in roost.config and synced with `roost push`. */
export function DecisionsTable({ data }: { data: AiData }) {
  const usage = new Map(data.usage.byTemplate.map((u) => [u.template, u]));
  return (
    <Card>
      <CardHeader title="Decision templates" />
      {data.decisions.length === 0 ? (
        <EmptyState title="No decision templates yet">
          Add <code className="font-mono text-xs">decisions</code> to roost.config and run <code className="font-mono text-xs">roost push</code>. Games call one by name, e.g.{" "}
          <code className="font-mono text-xs">roost.decide("message_kind", {"{ message }"})</code>, to classify or score something.
        </EmptyState>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="h-9 border-b border-border text-xs text-muted [&>th]:px-4 [&>th]:font-normal">
              <th>Decision</th>
              <th>Model</th>
              <th>Questions</th>
              <th className="text-right">Requests</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Errors</th>
            </tr>
          </thead>
          <tbody>
            {data.decisions.map((d) => {
              const u = usage.get(d.name);
              return (
                <tr key={d.id} className="h-11 border-b border-border last:border-0 hover:bg-hover [&>td]:px-4">
                  <td>
                    <span className="font-mono">{d.name}</span> <span className="font-mono text-xs text-muted">v{d.version}</span>
                  </td>
                  <td className="font-mono text-xs">{d.model}</td>
                  <td className="font-mono text-xs text-muted">{Object.keys(d.questions).join(", ")}</td>
                  <td className="text-right font-mono text-xs">{formatNumber(u?.requests ?? 0)}</td>
                  <td className="text-right font-mono text-xs">{formatUsd(u?.costUsd ?? 0)}</td>
                  <td className={`text-right font-mono text-xs ${u?.errors ? "text-danger" : ""}`}>{formatNumber(u?.errors ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
