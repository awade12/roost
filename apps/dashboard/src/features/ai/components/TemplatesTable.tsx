import { Button } from "../../../components/ui/index.ts";
import { Card, CardHeader } from "../../../components/ui/index.ts";
import { EmptyState } from "../../../components/ui/index.ts";
import { formatNumber } from "../../../lib/format.ts";
import { useCostFormat } from "../api/cost-precision.ts";
import type { AiData, AiTemplate } from "../api/use-ai.ts";

type Props = { data: AiData; canEdit: boolean; onEdit: (t: AiTemplate | null) => void };
type Usage = AiData["usage"]["byTemplate"][number];

function Row({ t, usage: u, canEdit, onEdit }: { t: AiTemplate; usage: Usage | undefined; canEdit: boolean; onEdit: Props["onEdit"] }) {
  const cost = useCostFormat();
  return (
    <tr className="h-11 border-b border-border last:border-0 hover:bg-hover [&>td]:px-4">
      <td>
        <span className="font-mono">{t.name}</span> <span className="font-mono text-xs text-muted">v{t.version}</span>
      </td>
      <td className="font-mono text-xs">
        {t.model}
        {t.fallbackModels.length > 0 && <span className="text-muted"> → {t.fallbackModels.join(", ")}</span>}
      </td>
      <td className="text-right font-mono text-xs">{formatNumber(u?.requests ?? 0)}</td>
      <td className="text-right font-mono text-xs">
        {formatNumber(u?.tokensIn ?? 0)} / {formatNumber(u?.tokensOut ?? 0)}
      </td>
      <td className="text-right font-mono text-xs">{cost(u?.costUsd ?? 0)}</td>
      <td className={`text-right font-mono text-xs ${u?.errors ? "text-danger" : ""}`}>{formatNumber(u?.errors ?? 0)}</td>
      <td className="text-right">
        {canEdit && (
          <button className="text-xs text-muted hover:text-fg" onClick={() => onEdit(t)}>
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

/** Templates with their model, fallbacks and last-30-day usage. */
export function TemplatesTable({ data, canEdit, onEdit }: Props) {
  const usage = new Map(data.usage.byTemplate.map((u) => [u.template, u]));
  const action = canEdit && (
    <Button variant="primary" className="h-7" onClick={() => onEdit(null)}>
      New template
    </Button>
  );
  return (
    <Card>
      <CardHeader title="Prompt templates" action={action} />
      {data.templates.length === 0 ? (
        <EmptyState title="No templates yet">
          Games call a template by name, e.g. <code className="font-mono text-xs">roost.ai("coach_chat", vars)</code>. The prompt and model live here, so you can change them without an app update.
        </EmptyState>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="h-9 border-b border-border text-xs text-muted [&>th]:px-4 [&>th]:font-normal">
              <th>Template</th>
              <th>Model → fallback</th>
              <th className="text-right">Requests</th>
              <th className="text-right">Tokens in / out</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Errors</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {data.templates.map((t) => (
              <Row key={t.id} t={t} usage={usage.get(t.name)} canEdit={canEdit} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
