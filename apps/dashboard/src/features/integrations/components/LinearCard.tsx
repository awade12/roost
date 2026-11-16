import { useState, type FormEvent } from "react";
import { Button, Card, CardHeader, ConfirmDialog, Field, Input, Select } from "../../../components/ui/index.ts";
import { useIntegrations, useLinearSetup } from "../api/use-linear.ts";

function Connect({ orgId }: { orgId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const { findTeams, connect } = useLinearSetup(orgId);
  const teams = findTeams.data;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!teams) findTeams.mutate(apiKey.trim(), { onSuccess: (t) => setTeamId(t[0]?.id ?? null) });
    else if (teamId) connect.mutate({ apiKey: apiKey.trim(), teamId });
  };
  const error = findTeams.error ?? connect.error;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-4">
      <p className="text-muted">Send issues to Linear with one click. Create a personal API key in Linear → Settings → API. It's stored encrypted and never shown again.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Linear API key">
          <Input mono type="password" autoComplete="off" placeholder="lin_api_…" value={apiKey} onChange={(e) => { setApiKey(e.target.value); findTeams.reset(); }} />
        </Field>
        {teams && (
          <Field label="Team">
            <Select aria-label="Linear team" value={teamId} onChange={setTeamId} options={teams.map((t) => ({ value: t.id, label: t.name, hint: t.key }))} />
          </Field>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error.message}</p>}
      <div className="flex justify-end">
        <Button variant="primary" disabled={!apiKey.trim() || findTeams.isPending || connect.isPending}>
          {teams ? "Connect Linear" : findTeams.isPending ? "Checking…" : "Check key"}
        </Button>
      </div>
    </form>
  );
}

/** Studio-level Linear connection. Only owners can change it. */
export function LinearCard({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const integrations = useIntegrations(orgId);
  const { disconnect } = useLinearSetup(orgId);
  const [confirming, setConfirming] = useState(false);
  const linear = integrations.data?.linear;
  return (
    <Card>
      <CardHeader title="Linear" action={linear && <span className="text-xs text-ok">Connected</span>} />
      {integrations.isPending && <p className="p-4 text-muted">Loading…</p>}
      {linear && (
        <div className="flex items-center justify-between p-4">
          <p>
            Issues go to <span className="font-medium">{linear.teamName}</span> <span className="font-mono text-xs text-muted">({linear.teamKey})</span>.
          </p>
          {isOwner && <Button onClick={() => setConfirming(true)}>Disconnect</Button>}
        </div>
      )}
      {integrations.data && !linear && (isOwner ? <Connect orgId={orgId} /> : <p className="p-4 text-muted">Not connected. An owner can connect Linear here.</p>)}
      <ConfirmDialog
        open={confirming}
        title="Disconnect Linear?"
        description="The saved key is deleted. Issues already sent keep their Linear links."
        confirmLabel="Disconnect"
        tone="danger"
        pending={disconnect.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => disconnect.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />
    </Card>
  );
}
