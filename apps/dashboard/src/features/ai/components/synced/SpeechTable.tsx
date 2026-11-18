import { Card, CardHeader } from "../../../../components/ui/index.ts";
import { EmptyState } from "../../../../components/ui/index.ts";
import { formatNumber } from "../../../../lib/format.ts";
import { useCostFormat } from "../../api/cost-precision.ts";
import type { AiData } from "../../api/use-ai.ts";

/** Speech (text-to-speech) templates, read-only: they're edited in roost.config and synced with `roost push`. */
export function SpeechTable({ data }: { data: AiData }) {
  const cost = useCostFormat();
  const usage = new Map(data.usage.byTemplate.map((u) => [u.template, u]));
  return (
    <Card>
      <CardHeader title="Speech templates" />
      {data.speech.length === 0 ? (
        <EmptyState title="No speech templates yet">
          Add <code className="font-mono text-xs">speech</code> to roost.config and run <code className="font-mono text-xs">roost push</code>. Games say a line by name, e.g.{" "}
          <code className="font-mono text-xs">roost.speak("narrator", text, {"{ voice }"})</code>, and get audio back.
        </EmptyState>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="h-9 border-b border-border text-xs text-muted [&>th]:px-4 [&>th]:font-normal">
              <th>Template</th>
              <th>Model</th>
              <th>Voices</th>
              <th>Format</th>
              <th className="text-right">Max chars</th>
              <th className="text-right">Requests</th>
              <th className="text-right">Characters</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Errors</th>
            </tr>
          </thead>
          <tbody>
            {data.speech.map((s) => {
              const u = usage.get(s.name);
              return (
                <tr key={s.id} className="h-11 border-b border-border last:border-0 hover:bg-hover [&>td]:px-4">
                  <td>
                    <span className="font-mono">{s.name}</span> <span className="font-mono text-xs text-muted">v{s.version}</span>
                  </td>
                  <td className="font-mono text-xs">{s.model}</td>
                  <td className="font-mono text-xs text-muted">{s.voices.join(", ")}</td>
                  <td className="font-mono text-xs">{s.format}</td>
                  <td className="text-right font-mono text-xs">{formatNumber(s.maxChars)}</td>
                  <td className="text-right font-mono text-xs">{formatNumber(u?.requests ?? 0)}</td>
                  <td className="text-right font-mono text-xs">{formatNumber(u?.tokensIn ?? 0)}</td>
                  {/* Looked up from OpenRouter after each call (core/ai/speech/cost.ts); 0 before that existed. */}
                  <td className="text-right font-mono text-xs">{cost(u?.costUsd ?? 0)}</td>
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
