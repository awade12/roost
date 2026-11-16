import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, CardHeader, EmptyState } from "../../components/ui/index.ts";
import { useCurrentOrg, useEnvironment } from "../studio/index.ts";
import { useAlerts, type AlertRule } from "./api/use-alerts.ts";
import { useChannels } from "./api/use-channels.ts";
import { AlertHistory } from "./components/AlertHistory.tsx";
import { RuleDialog } from "./components/RuleDialog.tsx";
import { RuleList } from "./components/RuleList.tsx";

/** Alert rules for the selected game, and what they've sent. */
export function AlertsPage() {
  const org = useCurrentOrg();
  const { selected } = useEnvironment();
  const game = selected?.game;
  const data = useAlerts(game?.id ?? "");
  const channels = useChannels(org?.id ?? "");
  const [editing, setEditing] = useState<AlertRule | "new" | null>(null);
  if (!org) return null;
  if (!game) return <Card className="mx-8 my-6"><EmptyState title="No games yet">Create a game under Settings first.</EmptyState></Card>;
  const canEdit = org.role !== "viewer";
  const noChannels = channels.data?.length === 0;

  return (
    <div className="flex max-w-4xl flex-col gap-5 px-8 py-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">Alerts</h1>
          <p className="text-muted">Get told about new issues, regressions and spikes in {game.name}, on Discord, Slack, a webhook or email.</p>
        </div>
        {canEdit && !noChannels && (
          <Button variant="primary" onClick={() => setEditing("new")} disabled={!channels.data}>
            New rule
          </Button>
        )}
      </div>

      {noChannels && (
        <Card>
          <EmptyState title="Add a channel first">
            Alerts need somewhere to go.{" "}
            <Link to="/settings/integrations" className="text-fg underline underline-offset-2">
              Add a Discord, Slack, webhook or email channel
            </Link>
            .
          </EmptyState>
        </Card>
      )}

      <Card>
        <CardHeader title="Rules" />
        {data.isPending && <p className="px-4 py-3 text-muted">Loading rules…</p>}
        {data.isError && <p className="px-4 py-3 text-danger">{data.error.message}</p>}
        {data.data?.rules.length === 0 && <p className="px-4 py-4 text-muted">No rules yet. A good first one: new crashes in production.</p>}
        {data.data && data.data.rules.length > 0 && (
          <RuleList gameId={game.id} rules={data.data.rules} environments={game.environments} channels={channels.data ?? []} canEdit={canEdit} onEdit={setEditing} />
        )}
      </Card>

      <Card>
        <CardHeader title="Recently sent" action={<span className="text-xs text-muted">Checked every minute</span>} />
        {data.data && <AlertHistory history={data.data.history} />}
      </Card>

      {editing && (
        <RuleDialog
          gameId={game.id}
          rule={editing === "new" ? null : editing}
          environments={game.environments}
          channels={channels.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
