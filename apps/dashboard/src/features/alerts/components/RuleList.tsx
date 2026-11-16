import { useState } from "react";
import { ConfirmDialog, Switch } from "../../../components/ui/index.ts";
import type { Environment } from "../../studio/index.ts";
import { useDeleteRule, useSaveRule, type AlertRule } from "../api/use-alerts.ts";
import type { AlertChannel } from "../api/use-channels.ts";

const WHEN: Record<AlertRule["trigger"], (r: AlertRule) => string> = {
  new_issue: () => "New issue",
  regression: () => "Regression",
  spike: (r) => `${r.threshold}+ reports in ${r.windowMinutes} min`,
};

const channelNames = (channels: AlertChannel[], ids: string[]) =>
  channels
    .filter((c) => ids.includes(c.id))
    .map((c) => c.name)
    .join(", ") || "no channels";

type Props = {
  gameId: string;
  rules: AlertRule[];
  environments: Environment[];
  channels: AlertChannel[];
  canEdit: boolean;
  onEdit: (rule: AlertRule) => void;
};

export function RuleList({ gameId, rules, environments, channels, canEdit, onEdit }: Props) {
  const save = useSaveRule(gameId);
  const remove = useDeleteRule(gameId);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const envName = (id: string) => environments.find((e) => e.id === id)?.name ?? "?";

  return (
    <ul className="divide-y divide-border">
      {rules.map((r) => (
        <li key={r.id} className="flex h-14 items-center gap-4 px-4">
          <Switch
            hideLabel
            label={`Enable ${r.name}`}
            checked={r.enabled}
            disabled={!canEdit}
            onChange={(enabled) => save.mutate({ id: r.id, form: { ...r, enabled } })}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={r.enabled ? "font-medium" : "font-medium text-muted"}>{r.name}</span>
            <span className="truncate text-xs text-muted">
              {WHEN[r.trigger](r)} · {r.kinds.join(", ")} · {envName(r.environmentId)} →{" "}
              {channelNames(channels, r.channelIds)}
            </span>
          </div>
          {canEdit && (
            <>
              <button className="text-xs text-muted hover:text-fg" onClick={() => onEdit(r)}>
                Edit
              </button>
              <button
                className="text-xs text-muted hover:text-danger"
                onClick={() => setDeleting(r)}
              >
                Delete
              </button>
            </>
          )}
        </li>
      ))}
      {(save.error ?? remove.error) && (
        <li className="px-4 py-3 text-xs text-danger">{(save.error ?? remove.error)?.message}</li>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this rule?"
        description={`"${deleting?.name ?? ""}" stops sending alerts. Its history goes with it.`}
        confirmLabel="Delete rule"
        tone="danger"
        pending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </ul>
  );
}
